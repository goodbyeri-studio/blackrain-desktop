import { FuseV1Options, FuseVersion } from "@electron/fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";
import MakerMSIX from "@electron-forge/maker-msix";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";

const releaseSigning = process.env.BLACKRAIN_RELEASE_SIGNING === "1";
const publisher = process.env.BLACKRAIN_RELEASE_PUBLISHER ?? "CN=goodbyeri-studio";

const config: ForgeConfig = {
  outDir: "out/electron",
  packagerConfig: {
    asar: true,
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
