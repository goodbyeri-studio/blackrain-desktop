/**
 * 给 node-pty 的 prebuilt spawn-helper 补上可执行位。
 *
 * 为什么需要这个脚本：
 * - node-pty 1.1.0 的 npm tarball 里 `prebuilds/<platform>/spawn-helper`
 *   是 644（无 +x）。已核对上游 tarball，不是本仓或某次安装的偶发问题。
 * - node-pty 自己的 `scripts/post-install.js` 只 chmod node-gyp 编译产物
 *   （`build/Release/`），不碰 `prebuilds/`。使用 prebuilt 路径时无人修它。
 * - 缺 +x 时 node-pty 的原生代码会以 `posix_spawnp failed.` 失败，
 *   即模块能 require 成功、但 pty.spawn() 一定挂——终端功能不可用。
 * - 每次 `npm ci` 都会把权限还原成 644，所以必须挂在 postinstall 上。
 *
 * Windows 不需要（conpty/winpty 走 DLL，无 spawn-helper）。
 */
import { chmod, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

// 只有这些文件需要 +x：它们是被 exec 的辅助可执行文件，不是 dlopen 的 .node。
const EXECUTABLE_NAMES = new Set(["spawn-helper"]);

/**
 * 给 prebuildsRoot 下所有平台目录里的辅助可执行文件补 +x。
 * 返回被修改的相对路径列表（已有 +x 的会跳过）。
 */
export async function fixNativePermissions({
  prebuildsRoot,
  platform = process.platform,
} = {}) {
  if (platform === "win32") {
    return [];
  }

  let platformDirs;
  try {
    platformDirs = await readdir(prebuildsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      // node-pty 未安装（例如只装了部分依赖）——不是错误。
      return [];
    }
    throw error;
  }

  const fixed = [];
  for (const entry of platformDirs) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(prebuildsRoot, entry.name);
    for (const file of await readdir(directory)) {
      if (!EXECUTABLE_NAMES.has(file)) continue;
      const target = path.join(directory, file);
      const { mode } = await stat(target);
      // 已经有 owner +x 就跳过，避免每次安装都无谓写盘。
      if (mode & 0o100) continue;
      await chmod(target, 0o755);
      fixed.push(target);
    }
  }
  return fixed;
}

async function main() {
  const fixed = await fixNativePermissions({
    prebuildsRoot: path.join(
      desktopRoot,
      "node_modules",
      "node-pty",
      "prebuilds",
    ),
  });
  if (fixed.length > 0) {
    const relative = fixed.map((file) => path.relative(desktopRoot, file));
    console.log(`[fix-native-permissions] chmod +x: ${relative.join(", ")}`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // 不要让权限修复失败阻断整个安装；但要让问题可见。
    console.error(`[fix-native-permissions] 失败: ${error.message}`);
    process.exitCode = 1;
  });
}
