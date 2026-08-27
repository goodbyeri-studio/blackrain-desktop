/**
 * 为 E2E 打包，并强制清空 Supabase 配置。
 *
 * 为什么需要这一层：
 * - vite 在构建时把 `VITE_SUPABASE_*` 内联进 renderer。
 * - `.env.local` 被 `*.local` gitignore，所以它只存在于开发者本机。
 * - 有 `.env.local` 的机器：`isSupabaseConfigured()` 为 true，账号解析成
 *   `signed-out`（E2E 用的是全新 appdata，没有缓存会话），`AccountGate`
 *   渲染 `LoginScreen`，主 UI 永不挂载 —— E2E 的桌面布局断言必然失败。
 * - CI：没有 `.env.local`，配置为空 -> `unconfigured` -> 门禁放行 -> 通过。
 *
 * 即同一份代码在 CI 通过、在本机失败，取决于开发者是否恰好有 `.env.local`。
 * 这让 E2E 不可作为门禁。这里显式清空，使两边一致；与
 * `vite.config.ts` 里 `test.env` 对 vitest 做的事同一个思路。
 *
 * E2E 断言的是桌面布局、IPC 合同与 Browser 行为，不是登录流程，因此
 * 「未配置账号」是正确的被测形态。登录路径需要独立的测试。
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

const child = spawn(
  process.execPath,
  [path.join(desktopRoot, "node_modules", ".bin", "electron-forge"), "package"],
  {
    cwd: desktopRoot,
    env: {
      ...process.env,
      // 空字符串而非 delete：vite 的 `loadEnv` 仍会读 .env.local，
      // 显式空值才能覆盖它。
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(`[package-for-e2e] 启动 electron-forge 失败: ${error.message}`);
  process.exitCode = 1;
});
