import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hostPlatformKey,
  validateLock,
  verifyRuntime,
} from "./verify-codex-runtime.mjs";

const SHA_A = "a".repeat(64);
const COMMIT = "b".repeat(40);
const SUBJECT = "CN=OpenAI Test";
const THUMBPRINT = "C".repeat(40);
const AUTHORITY = "Developer ID Application: OpenAI Test (2DC432GLL2)";
const TEAM_ID = "2DC432GLL2";

/** 两个平台的差异集中在这里：可执行文件名与签名机制。 */
const CASES = [
  {
    label: "macOS arm64 / codesign",
    platformKey: "darwin-arm64",
    target: "aarch64-apple-darwin",
    executable: "bin/codex",
    signature: {
      codesign: { authority: AUTHORITY, teamIdentifier: TEAM_ID, files: ["bin/codex"] },
    },
    manifestSignature: {
      codesign: { status: "Valid", authority: AUTHORITY, teamIdentifier: TEAM_ID },
    },
  },
  {
    label: "Windows x64 / Authenticode",
    platformKey: "windows-x64",
    target: "x86_64-pc-windows-msvc",
    executable: "bin/codex.exe",
    signature: {
      authenticode: { subject: SUBJECT, thumbprint: THUMBPRINT, files: ["bin/codex.exe"] },
    },
    manifestSignature: {
      authenticode: { status: "Valid", subject: SUBJECT, thumbprint: THUMBPRINT },
    },
  },
] as const;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("Codex runtime 完整性校验", () => {
  it.each(CASES)(
    "拒绝与生成态 manifest 一起被替换的 runtime 文件（$label）",
    async (testCase) => {
      const runtimeRoot = await mkdtemp(
        path.join(os.tmpdir(), "blackrain-runtime-verify-"),
      );
      temporaryRoots.push(runtimeRoot);
      await mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
      await mkdir(path.join(runtimeRoot, "licenses"), { recursive: true });

      const executablePath = path.join(runtimeRoot, testCase.executable);
      const licensePath = path.join(runtimeRoot, "licenses", "LICENSE");
      await writeFile(executablePath, "trusted-runtime");
      await writeFile(licensePath, "trusted-license");

      const executableDigest = digest("trusted-runtime");
      const licenseDigest = digest("trusted-license");
      const lock = createLock(testCase, executableDigest, licenseDigest);
      const { platform } = validateLock(lock, testCase.platformKey);
      await writeManifest(runtimeRoot, testCase, lock, executableDigest, licenseDigest);

      await expect(
        verifyRuntime(lock, platform, { runtimeRoot }),
      ).resolves.toBe(undefined);

      await writeFile(executablePath, "replaced-runtime");
      await writeManifest(
        runtimeRoot,
        testCase,
        lock,
        digest("replaced-runtime"),
        licenseDigest,
      );

      await expect(
        verifyRuntime(lock, platform, { runtimeRoot }),
      ).rejects.toThrow(/manifest 摘要与 runtime-lock 不一致/);
    },
  );

  it("拒绝签名断言缺失或身份不符的 manifest", async () => {
    const testCase = CASES[0];
    const runtimeRoot = await mkdtemp(
      path.join(os.tmpdir(), "blackrain-runtime-sig-"),
    );
    temporaryRoots.push(runtimeRoot);
    await mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await mkdir(path.join(runtimeRoot, "licenses"), { recursive: true });
    await writeFile(path.join(runtimeRoot, testCase.executable), "trusted-runtime");
    await writeFile(path.join(runtimeRoot, "licenses", "LICENSE"), "trusted-license");

    const executableDigest = digest("trusted-runtime");
    const licenseDigest = digest("trusted-license");
    const lock = createLock(testCase, executableDigest, licenseDigest);
    const { platform } = validateLock(lock, testCase.platformKey);

    // 摘要都对，但 codesign 身份被替换成了别人。
    await writeManifest(runtimeRoot, testCase, lock, executableDigest, licenseDigest, {
      codesign: {
        status: "Valid",
        authority: "Developer ID Application: Someone Else (XXXXXXXXXX)",
        teamIdentifier: "XXXXXXXXXX",
      },
    });
    await expect(
      verifyRuntime(lock, platform, { runtimeRoot }),
    ).rejects.toThrow(/缺少有效 codesign 记录/);
  });

  it("拒绝未支持的平台键，并要求宿主平台已 vendored", () => {
    const lock = createLock(CASES[0], SHA_A, SHA_A);
    lock.platforms["linux-x64"] = lock.platforms["darwin-arm64"];
    expect(() => validateLock(lock, "darwin-arm64")).toThrow(
      /未支持的平台键 linux-x64/,
    );
    expect(() => hostPlatformKey("linux", "x64")).toThrow(
      /没有 vendored Codex runtime/,
    );
    expect(hostPlatformKey("darwin", "arm64")).toBe("darwin-arm64");
    expect(hostPlatformKey("win32", "x64")).toBe("windows-x64");
  });
});

function createLock(
  testCase: (typeof CASES)[number],
  executableDigest: string,
  licenseDigest: string,
) {
  return {
    schemaVersion: 1,
    upstream: { tag: "rust-v0.0.0", commit: COMMIT, license: "Apache-2.0" },
    licenses: [
      {
        path: "licenses/LICENSE",
        url: `https://raw.githubusercontent.com/openai/codex/${COMMIT}/LICENSE`,
        sha256: licenseDigest,
      },
    ],
    platforms: {
      [testCase.platformKey]: {
        target: testCase.target,
        ...testCase.signature,
        archive: {
          fileName: "codex.tar.gz",
          url: "https://github.com/openai/codex/releases/download/rust-v0.0.0/codex.tar.gz",
          sha256: SHA_A,
        },
        requiredFiles: [{ path: testCase.executable, sha256: executableDigest }],
      },
    } as Record<string, Record<string, unknown>>,
  };
}

async function writeManifest(
  runtimeRoot: string,
  testCase: (typeof CASES)[number],
  lock: ReturnType<typeof createLock>,
  executableDigest: string,
  licenseDigest: string,
  signatureOverride?: Record<string, unknown>,
) {
  const manifest = {
    schemaVersion: 1,
    upstream: { tag: lock.upstream.tag, commit: lock.upstream.commit },
    archive: {
      sha256: (lock.platforms[testCase.platformKey].archive as { sha256: string })
        .sha256,
    },
    files: [
      {
        path: testCase.executable,
        sha256: executableDigest,
        ...(signatureOverride ?? testCase.manifestSignature),
      },
      { path: "licenses/LICENSE", sha256: licenseDigest },
    ],
  };
  await writeFile(
    path.join(runtimeRoot, "runtime-manifest.json"),
    JSON.stringify(manifest),
  );
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
