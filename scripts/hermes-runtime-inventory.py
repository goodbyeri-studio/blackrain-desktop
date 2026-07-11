#!/usr/bin/env python3
"""Inventory a built Hermes runtime and collect distribution license files."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import shutil
from pathlib import Path


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unknown"


def is_license_file(path: Path) -> bool:
    lowered = [part.lower() for part in path.parts]
    name = path.name.lower()
    return (
        "licenses" in lowered
        or name.startswith("license")
        or name.startswith("copying")
        or name.startswith("notice")
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--licenses", required=True, type=Path)
    args = parser.parse_args()
    args.licenses.mkdir(parents=True, exist_ok=True)

    packages: list[dict[str, object]] = []
    for dist in sorted(
        importlib.metadata.distributions(),
        key=lambda item: (item.metadata.get("Name") or "unknown").lower(),
    ):
        name = dist.metadata["Name"] or "unknown"
        target = args.licenses / f"{safe_name(name)}-{safe_name(dist.version)}"
        copied: list[str] = []
        for relative in dist.files or []:
            relative_path = Path(str(relative))
            if not is_license_file(relative_path):
                continue
            source = Path(dist.locate_file(relative))
            if not source.is_file():
                continue
            target.mkdir(parents=True, exist_ok=True)
            destination = target / safe_name("__".join(relative_path.parts))
            shutil.copy2(source, destination)
            copied.append(destination.name)
        packages.append(
            {
                "name": name,
                "version": dist.version,
                "licenseExpression": dist.metadata.get("License-Expression"),
                "license": dist.metadata.get("License"),
                "licenseClassifiers": [
                    value
                    for value in dist.metadata.get_all("Classifier", [])
                    if value.startswith("License ::")
                ],
                "licenseFiles": copied,
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"schemaVersion": 1, "packages": packages}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
