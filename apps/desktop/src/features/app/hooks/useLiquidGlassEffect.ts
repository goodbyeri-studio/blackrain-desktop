import type { DebugEntry } from "../../../types";

type Params = {
  reduceTransparency: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useLiquidGlassEffect(_params: Params) {
  // Electron 窗口由 main 在首帧就绪后显示；Windows MVP 不启用旧宿主材质层。
}
