import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveBlackRainDataPaths,
  resolveElectronAppDataPath,
} from "./data-paths";

describe("resolveBlackRainDataPaths", () => {
  it("只在 BlackRain app-data 下建立 Electron 宿主状态目录", () => {
    const appDataPath = path.resolve("test-data", "AppData", "Roaming");
    const root = path.join(appDataPath, "BlackRain");

    expect(resolveBlackRainDataPaths(appDataPath)).toEqual({
      root,
      browserData: path.join(root, "browser-data"),
      appState: path.join(root, "app-state"),
      logs: path.join(root, "logs"),
      artifacts: path.join(root, "artifacts"),
    });
  });

  it("拒绝相对 appData 路径", () => {
    expect(() => resolveBlackRainDataPaths("AppData/Roaming")).toThrow(
      "绝对路径",
    );
  });
});

describe("resolveElectronAppDataPath", () => {
  const defaultPath = path.resolve("test-data", "default-app-data");
  const testPath = path.resolve("test-data", "isolated-app-data");

  it.each([
    "BLACKRAIN_ELECTRON_SMOKE",
    "BLACKRAIN_ELECTRON_E2E",
    "BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE",
  ] as const)(
    "仅在 %s 测试运行中使用隔离目录",
    (testFlag) => {
      expect(
        resolveElectronAppDataPath(defaultPath, {
          [testFlag]: "1",
          BLACKRAIN_ELECTRON_TEST_APP_DATA: testPath,
        }),
      ).toBe(testPath);
    },
  );

  it("普通启动忽略测试目录 override", () => {
    expect(
      resolveElectronAppDataPath(defaultPath, {
        BLACKRAIN_ELECTRON_TEST_APP_DATA: testPath,
      }),
    ).toBe(defaultPath);
  });
});
