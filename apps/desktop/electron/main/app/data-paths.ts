import { mkdirSync } from "node:fs";
import path from "node:path";

export const BLACKRAIN_DATA_DIRECTORY_NAME = "BlackRain";

export type BlackRainDataPaths = {
  root: string;
  browserData: string;
  appState: string;
  logs: string;
  artifacts: string;
};

export function resolveElectronAppDataPath(
  defaultAppDataPath: string,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const isTestRun =
    environment.BLACKRAIN_ELECTRON_SMOKE === "1" ||
    environment.BLACKRAIN_ELECTRON_E2E === "1";
  const testAppDataPath = environment.BLACKRAIN_ELECTRON_TEST_APP_DATA?.trim();

  return isTestRun && testAppDataPath ? testAppDataPath : defaultAppDataPath;
}

export function resolveBlackRainDataPaths(appDataPath: string): BlackRainDataPaths {
  const normalizedAppDataPath = appDataPath.trim();
  if (!normalizedAppDataPath || !path.isAbsolute(normalizedAppDataPath)) {
    throw new Error("Electron appData 必须是绝对路径");
  }

  const root = path.join(
    path.normalize(normalizedAppDataPath),
    BLACKRAIN_DATA_DIRECTORY_NAME,
  );
  return {
    root,
    browserData: path.join(root, "browser-data"),
    appState: path.join(root, "app-state"),
    logs: path.join(root, "logs"),
    artifacts: path.join(root, "artifacts"),
  };
}

export function ensureBlackRainDataPaths(appDataPath: string): BlackRainDataPaths {
  const paths = resolveBlackRainDataPaths(appDataPath);
  for (const directory of Object.values(paths)) {
    mkdirSync(directory, { recursive: true });
  }
  return paths;
}
