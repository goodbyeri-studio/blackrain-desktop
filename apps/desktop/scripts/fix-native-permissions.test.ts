import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixNativePermissions } from "./fix-native-permissions.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

async function createPrebuilds(files: Record<string, number>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "blackrain-prebuilds-"));
  temporaryRoots.push(root);
  for (const [relative, mode] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "binary");
    await chmod(target, mode);
  }
  return root;
}

async function isExecutable(file: string) {
  const { mode } = await stat(file);
  return Boolean(mode & 0o100);
}

describe("fixNativePermissions", () => {
  it("给 644 的 spawn-helper 补上 +x", async () => {
    const prebuildsRoot = await createPrebuilds({
      "darwin-arm64/spawn-helper": 0o644,
      "darwin-arm64/pty.node": 0o644,
    });

    const fixed = await fixNativePermissions({
      prebuildsRoot,
      platform: "darwin",
    });

    expect(fixed).toHaveLength(1);
    expect(
      await isExecutable(path.join(prebuildsRoot, "darwin-arm64/spawn-helper")),
    ).toBe(true);
    // pty.node 是 dlopen 加载的，不需要 +x——不应被误改。
    expect(
      await isExecutable(path.join(prebuildsRoot, "darwin-arm64/pty.node")),
    ).toBe(false);
  });

  it("已有 +x 时跳过，不重复写盘", async () => {
    const prebuildsRoot = await createPrebuilds({
      "darwin-arm64/spawn-helper": 0o755,
    });

    const fixed = await fixNativePermissions({
      prebuildsRoot,
      platform: "darwin",
    });

    expect(fixed).toEqual([]);
  });

  it("覆盖所有平台目录", async () => {
    const prebuildsRoot = await createPrebuilds({
      "darwin-arm64/spawn-helper": 0o644,
      "darwin-x64/spawn-helper": 0o644,
    });

    const fixed = await fixNativePermissions({
      prebuildsRoot,
      platform: "darwin",
    });

    expect(fixed).toHaveLength(2);
  });

  it("Windows 上是 no-op（conpty/winpty 走 DLL，无 spawn-helper）", async () => {
    const prebuildsRoot = await createPrebuilds({
      "win32-x64/spawn-helper": 0o644,
    });

    const fixed = await fixNativePermissions({
      prebuildsRoot,
      platform: "win32",
    });

    expect(fixed).toEqual([]);
  });

  it("node-pty 未安装时静默返回，不阻断 postinstall", async () => {
    await expect(
      fixNativePermissions({
        prebuildsRoot: path.join(os.tmpdir(), "blackrain-does-not-exist-xyz"),
        platform: "darwin",
      }),
    ).resolves.toEqual([]);
  });
});
