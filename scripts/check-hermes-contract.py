#!/usr/bin/env python3
"""Validate the pinned Hermes source and BlackRain WORK protocol seam."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HERMES = ROOT / "hermes-upstream"
MANIFEST = (
    ROOT
    / "apps"
    / "desktop"
    / "src-tauri"
    / "resources"
    / "hermes-runtime"
    / "windows-x64.manifest.json"
)
FIXTURE_PARENT = (
    ROOT / "apps" / "desktop" / "src-tauri" / "test-fixtures" / "hermes"
)

REQUIRED_ROUTES = {
    ("GET", "/health"),
    ("GET", "/v1/capabilities"),
    ("GET", "/v1/models"),
    ("POST", "/v1/runs"),
    ("GET", "/v1/runs/{run_id}"),
    ("GET", "/v1/runs/{run_id}/events"),
    ("POST", "/v1/runs/{run_id}/approval"),
    ("POST", "/v1/runs/{run_id}/stop"),
    ("GET", "/api/sessions"),
    ("POST", "/api/sessions"),
    ("GET", "/api/sessions/{session_id}"),
    ("GET", "/api/sessions/{session_id}/messages"),
}

REQUIRED_FEATURES = {
    "run_submission",
    "run_status",
    "run_events_sse",
    "run_stop",
    "run_approval_response",
    "tool_progress_events",
    "approval_events",
    "session_resources",
}

REQUIRED_FIXTURES = {
    "health.json",
    "capabilities.json",
    "models.json",
    "run-started.json",
    "run-status-running.json",
    "run-status-completed.json",
    "run-status-failed.json",
    "run-status-cancelled.json",
    "approval-request.json",
    "approval-response.json",
    "stop-response.json",
    "sse-normal.txt",
    "sse-approval-pending.txt",
    "sse-approval-approved.txt",
    "sse-approval-denied.txt",
    "sse-cancelled.txt",
    "sse-failures.txt",
    "sse-duplicates-unknown-out-of-order.txt",
}

UPSTREAM_TESTS = [
    "tests/gateway/test_api_server.py",
    "tests/gateway/test_api_server_runs.py",
    "tests/gateway/test_api_server_bind_guard.py",
    "tests/test_windows_subprocess_no_window_flags.py",
    "tests/tools/test_windows_native_support.py",
    "tests/agent/test_external_skills.py",
    "tests/agent/test_external_skills_dirs_cache.py",
    "tests/tools/test_file_write_safety.py",
    "tests/tools/test_approval.py",
]


class ContractFailure(RuntimeError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def capture(command: list[str], cwd: Path = ROOT) -> str:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise ContractFailure(f"命令失败: {' '.join(command)}\n{detail}")
    return result.stdout.strip()


def run(command: list[str], cwd: Path) -> None:
    print(f"\n→ ({cwd.relative_to(ROOT) or Path('.')}) {' '.join(command)}", flush=True)
    result = subprocess.run(command, cwd=cwd, check=False)
    if result.returncode != 0:
        raise ContractFailure(
            f"回归命令退出码 {result.returncode}: {' '.join(command)}"
        )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def shell_assignments(path: Path) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.isidentifier():
            parsed = shlex.split(value, comments=True)
            if len(parsed) == 1:
                assignments[key] = parsed[0]
    return assignments


def extract_routes(path: Path) -> set[tuple[str, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    methods = {
        "add_get": "GET",
        "add_post": "POST",
        "add_patch": "PATCH",
        "add_delete": "DELETE",
        "add_put": "PUT",
    }
    routes: set[tuple[str, str]] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        method = methods.get(node.func.attr)
        if method is None or not node.args:
            continue
        route = node.args[0]
        if isinstance(route, ast.Constant) and isinstance(route.value, str):
            routes.add((method, route.value))
    return routes


def validate_static_contract() -> dict[str, str]:
    check(MANIFEST.is_file(), f"缺少 runtime manifest: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    check(manifest.get("schemaVersion") == 1, "未知 Hermes runtime manifest schema")
    hermes_lock = manifest.get("hermes", {})
    expected = {
        "tag": str(hermes_lock.get("tag", "")),
        "commit": str(hermes_lock.get("commit", "")),
        "version": str(hermes_lock.get("version", "")),
    }
    check(expected["tag"].startswith("v"), "Hermes tag 未锁定")
    check(len(expected["commit"]) == 40, "Hermes commit 必须是完整 SHA")
    check(expected["version"], "Hermes package version 未锁定")

    fetch_lock = shell_assignments(ROOT / "scripts" / "fetch-references.sh")
    check(fetch_lock.get("HERMES_TAG") == expected["tag"], "fetch 脚本 tag 与 manifest 漂移")
    check(
        fetch_lock.get("HERMES_COMMIT") == expected["commit"],
        "fetch 脚本 commit 与 manifest 漂移",
    )

    check((HERMES / ".git").exists(), "缺少 hermes-upstream；先运行 fetch-references")
    actual_commit = capture(["git", "rev-parse", "HEAD"], HERMES)
    actual_tag = capture(["git", "describe", "--tags", "--exact-match", "HEAD"], HERMES)
    dirty = capture(["git", "status", "--porcelain", "--untracked-files=no"], HERMES)
    check(actual_commit == expected["commit"], "hermes-upstream HEAD 与 manifest commit 不一致")
    check(actual_tag == expected["tag"], "hermes-upstream exact tag 与 manifest tag 不一致")
    check(not dirty, "hermes-upstream 存在已跟踪改动；黑盒回归必须基于干净上游")

    digest_fields = {
        "LICENSE": "licenseSha256",
        "pyproject.toml": "pyprojectSha256",
        "uv.lock": "uvLockSha256",
    }
    for relative, field in digest_fields.items():
        expected_digest = str(hermes_lock.get(field, ""))
        check(len(expected_digest) == 64, f"manifest 缺少 {field}")
        check(
            sha256(HERMES / relative) == expected_digest,
            f"Hermes {relative} hash 与 manifest 不一致；升级时必须重新审计并更新存证",
        )
    license_text = (HERMES / "LICENSE").read_text(encoding="utf-8")
    check("MIT License" in license_text, "Hermes LICENSE 不再声明 MIT")
    check("Permission is hereby granted" in license_text, "Hermes LICENSE 内容异常")

    api_server = HERMES / "gateway" / "platforms" / "api_server.py"
    routes = extract_routes(api_server)
    missing_routes = sorted(REQUIRED_ROUTES - routes)
    check(not missing_routes, f"Hermes API 缺少 BlackRain 必需路由: {missing_routes}")

    fixture_root = FIXTURE_PARENT / expected["tag"]
    check(fixture_root.is_dir(), f"缺少当前 tag fixtures: {fixture_root}")
    missing_fixtures = sorted(
        name for name in REQUIRED_FIXTURES if not (fixture_root / name).is_file()
    )
    check(not missing_fixtures, f"缺少 Hermes contract fixtures: {missing_fixtures}")
    capabilities = json.loads((fixture_root / "capabilities.json").read_text(encoding="utf-8"))
    check(capabilities.get("auth", {}).get("required") is True, "fixture 未强制 bearer")
    check(
        capabilities.get("runtime", {}).get("split_runtime") is False,
        "fixture runtime 边界不再是 server-side tools",
    )
    features = capabilities.get("features", {})
    missing_features = sorted(name for name in REQUIRED_FEATURES if features.get(name) is not True)
    check(not missing_features, f"fixture 缺少必需 capabilities: {missing_features}")
    fixture_readme = (fixture_root / "README.md").read_text(encoding="utf-8")
    check(expected["commit"] in fixture_readme, "fixture README 未存证当前 Hermes commit")

    print(
        f"✓ 静态 contract 通过: {expected['tag']} ({expected['commit']}) / {len(routes)} routes / {len(REQUIRED_FIXTURES)} fixtures"
    )
    return expected


def resolve_upstream_python(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    candidates.extend(
        [
            HERMES / ".venv" / "Scripts" / "python.exe",
            HERMES / ".venv" / "bin" / "python",
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            # Keep the venv entrypoint path intact. Resolving its symlink to the
            # base interpreter bypasses pyvenv.cfg and loses installed dev deps.
            return candidate.absolute()
    raise ContractFailure(
        "缺少 Hermes dev venv。先在 hermes-upstream 运行 `uv sync --frozen --extra dev --extra mcp`，"
        "或传 `--upstream-python`。只做静态审计可用 `--static-only`。"
    )


def run_regression(upstream_python: Path) -> None:
    run([str(upstream_python), "-m", "pytest", "-q", *UPSTREAM_TESTS], HERMES)

    cargo = shutil.which("cargo")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    check(cargo is not None, "PATH 中找不到 cargo")
    check(npm is not None, "PATH 中找不到 npm")
    run(
        [cargo, "test", "hermes", "--lib"],
        ROOT / "apps" / "desktop" / "src-tauri",
    )
    run(
        [
            npm,
            "run",
            "test",
            "--",
            "src/features/work/types.test.ts",
            "src/services/events.test.ts",
            "src/services/tauri.test.ts",
        ],
        ROOT / "apps" / "desktop",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="校验锁定 Hermes 与 BlackRain WORK contract，并可运行升级回归矩阵。"
    )
    parser.add_argument(
        "--static-only",
        action="store_true",
        help="只校验锁、hash、AST 路由和 fixtures，不运行 pytest/cargo/vitest。",
    )
    parser.add_argument(
        "--upstream-python",
        help="Hermes dev venv 的 Python 路径；默认探测 hermes-upstream/.venv。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        validate_static_contract()
        if not args.static_only:
            run_regression(resolve_upstream_python(args.upstream_python))
            print("\n✓ Hermes 上游升级 contract regression 全部通过")
        return 0
    except (ContractFailure, json.JSONDecodeError, SyntaxError) as error:
        print(f"\n✗ Hermes contract regression 失败: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
