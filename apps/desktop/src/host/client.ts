import type { BlackRainHostApi } from "../../electron/shared/host-api";

declare global {
  interface Window {
    blackrain?: BlackRainHostApi;
  }
}

export function getHostClient(): BlackRainHostApi {
  if (!window.blackrain) {
    throw new Error("当前宿主没有提供 BlackRain typed API");
  }
  return window.blackrain;
}

export function getOptionalHostClient(): BlackRainHostApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.blackrain ?? null;
}
