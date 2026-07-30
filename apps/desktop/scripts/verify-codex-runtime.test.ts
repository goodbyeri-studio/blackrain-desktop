import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateLock, verifyRuntime } from "./verify-codex-runtime.mjs";

const SHA_A = "a".repeat(64);
const COMMIT = "b".repeat(40);
const SUBJECT = "CN=OpenAI Test";
const THUMBPRINT = "C".repeat(40);

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("Codex runtime 完整性校验", () => {
  it("拒绝与生成态 manifest 一起被替换的 runtime 文件", async () => {
    const runtimeRoot = await mkdtemp(
      path.join(os.tmpdir(), "blackrain-runtime-verify-"),
    );
    temporaryRoots.push(runtimeRoot);
    await mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await mkdir(path.join(runtimeRoot, "licenses"), { recursive: true });

    const executablePath = path.join(runtimeRoot, "bin", "codex.exe");
    const licensePath = path.join(runtimeRoot, "licenses", "LICENSE");
    await writeFile(executablePath, "trusted-runtime");
    await writeFile(licensePath, "trusted-license");

    const executableDigest = digest("trusted-runtime");
    const licenseDigest = digest("trusted-license");
    const lock = createLock(executableDigest, licenseDigest);
    const { platform } = validateLock(lock);
    await writeManifest(runtimeRoot, lock, executableDigest, licenseDigest);

    await expect(verifyRuntime(lock, platform, { runtimeRoot })).resolves.toBe(
      undefined,
    );

    await writeFile(executablePath, "replaced-runtime");
    await writeManifest(
      runtimeRoot,
      lock,
      digest("replaced-runtime"),
      licenseDigest,
    );

    await expect(
      verifyRuntime(lock, platform, { runtimeRoot }),
    ).rejects.toThrow(/manifest 摘要与 runtime-lock 不一致/);
  });
});

function createLock(executableDigest, licenseDigest) {
  return {
    schemaVersion: 1,
    upstream: {
      tag: "rust-v0.0.0",
      commit: COMMIT,
      license: "Apache-2.0",
    },
    licenses: [
      {
        path: "licenses/LICENSE",
        url: `https://raw.githubusercontent.com/openai/codex/${COMMIT}/LICENSE`,
        sha256: licenseDigest,
      },
    ],
    platforms: {
      "windows-x64": {
        target: "x86_64-pc-windows-msvc",
        authenticode: {
          subject: SUBJECT,
          thumbprint: THUMBPRINT,
          files: ["bin/codex.exe"],
        },
        archive: {
          fileName: "codex.tar.gz",
          url: "https://github.com/openai/codex/releases/download/rust-v0.0.0/codex.tar.gz",
          sha256: SHA_A,
        },
        requiredFiles: [
          { path: "bin/codex.exe", sha256: executableDigest },
        ],
      },
    },
  };
}

async function writeManifest(
  runtimeRoot,
  lock,
  executableDigest,
  licenseDigest,
) {
  const manifest = {
    schemaVersion: 1,
    upstream: {
      tag: lock.upstream.tag,
      commit: lock.upstream.commit,
    },
    archive: {
      sha256: lock.platforms["windows-x64"].archive.sha256,
    },
    files: [
      {
        path: "bin/codex.exe",
        sha256: executableDigest,
        authenticode: {
          status: "Valid",
          subject: SUBJECT,
          thumbprint: THUMBPRINT,
        },
      },
      { path: "licenses/LICENSE", sha256: licenseDigest },
    ],
  };
  await writeFile(
    path.join(runtimeRoot, "runtime-manifest.json"),
    JSON.stringify(manifest),
  );
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
