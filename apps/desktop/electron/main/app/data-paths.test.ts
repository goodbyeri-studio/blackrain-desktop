import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBlackRainDataPaths } from "./data-paths";

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
