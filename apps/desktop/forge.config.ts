import { FuseV1Options, FuseVersion } from "@electron/fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";
import MakerMSIX from "@electron-forge/maker-msix";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";

const releaseSigning = process.env.BLACKRAIN_RELEASE_SIGNING === "1";
const publisher = process.env.BLACKRAIN_RELEASE_PUBLISHER ?? "CN=goodbyeri-studio";

const config: ForgeConfig = {
  outDir: "out/electron",
  // node-pty 用 node-addon-api（N-API），其 prebuilt 二进制带 napi 符号且
  // ABI 跨 Node/Electron 版本稳定——实测在 Electron 42 内置的 Node 24 下
  // 直接 require 成功，不需要重编译。Forge 默认会对包内原生模块跑
  // @electron/rebuild，那需要 Python 与完整 C++ 工具链，在本机与 CI 上都会
  // 失败。显式清空 onlyModules 以跳过重编译，直接采用 prebuilds。
  rebuildConfig: { onlyModules: [] },
  packagerConfig: {
    // 原生资产无法从 asar 内部 dlopen 或 exec，必须解包到 app.asar.unpacked/。
    // 注意 spawn-helper 没有扩展名，靠 `*.{node,...}` 匹配不到，要单独列出。
    asar: {
      unpack:
        "**/node_modules/node-pty/prebuilds/**/*{.node,.dylib,.so,.dll,spawn-helper}",
    },
    // VitePlugin 默认把 ignore 设成「除 /.vite 外全部排除」，导致 node_modules
    // 完全不进 asar。node-pty 是原生模块、必须 external（否则它的 loader 会
    // 按 bundle 所在目录解析 .node 而失败），因此它必须真实存在于包内。
    // 这里显式提供 ignore——VitePlugin 检测到已设置就不再覆盖。
    // 只放行 node-pty 本体：它运行时只 require 内部模块与 Node 内建，
    // node-addon-api 仅编译期需要，不必随包。
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith("/.vite")) return false;
      // 放行 node-pty 及其父目录（父目录不放行则子路径不会被遍历）。
      if (file === "/node_modules") return false;
      if (file.startsWith("/node_modules/node-pty")) return false;
      return true;
    },
    executableName: "BlackRain",
    icon: "icon.png",
    protocols: [{ name: "BlackRain Thread Link", schemes: ["blackrain"] }],
    extraResource: [
      "icon.png",
      "resources/codex",
      "resources/browser-client",
      "resources/node-runtime",
    ],
  },
  makers: [
    new MakerMSIX({
      sign: releaseSigning,
      ...(releaseSigning
        ? {
            windowsSignOptions: {
              certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
              certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
              description: "BlackRain",
            },
          }
        : {}),
      manifestVariables: {
        packageIdentity: "cc.goodbyeri.blackrain",
        publisher,
        packageDisplayName: "BlackRain",
        appDisplayName: "BlackRain",
        appExecutable: "BlackRain.exe",
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "electron/main/index.ts",
          config: "vite.main.config.ts",
        },
        {
          entry: "electron/preload/index.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
