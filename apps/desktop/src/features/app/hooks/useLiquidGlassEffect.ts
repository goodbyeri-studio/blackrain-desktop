import { useEffect, useRef } from "react";
import {
  isGlassSupported,
  setLiquidGlassEffect,
  GlassMaterialVariant,
} from "tauri-plugin-liquid-glass-api";
import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";
import type { DebugEntry } from "../../../types";

type Params = {
  reduceTransparency: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

// 窗口启动时 visible:false(见 tauri.conf.json),待毛玻璃应用完成 + 首帧绘制后
// 再 show,消除「启动透桌面」与「黑闪」两个中间态。整个进程只 show 一次。
let didShowWindow = false;

async function showWindowOnce() {
  if (didShowWindow) {
    return;
  }
  didShowWindow = true;
  try {
    await getCurrentWindow().show();
  } catch {
    // 非 Tauri 环境(测试/Storybook)无窗口,忽略
  }
}

export function useLiquidGlassEffect({ reduceTransparency, onDebug }: Params) {
  const supportedRef = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const apply = async () => {
      try {
        const window = getCurrentWindow();
        if (reduceTransparency) {
          if (supportedRef.current === null) {
            supportedRef.current = await isGlassSupported();
          }
          if (supportedRef.current) {
            await setLiquidGlassEffect({ enabled: false });
          }
          await window.setEffects({ effects: [] });
          return;
        }

        if (supportedRef.current === null) {
          supportedRef.current = await isGlassSupported();
        }
        if (cancelled) {
          return;
        }
        if (supportedRef.current) {
          await window.setEffects({ effects: [] });
          await setLiquidGlassEffect({
            enabled: true,
            cornerRadius: 16,
            variant: GlassMaterialVariant.Regular,
          });
          return;
        }

        const userAgent = navigator.userAgent ?? "";
        const isMac = userAgent.includes("Macintosh");
        const isLinux = userAgent.includes("Linux");
        const isWindows = userAgent.includes("Windows");

        if (isWindows) {
          await window.setEffects({
            effects: [Effect.Acrylic],
            state: EffectState.Active,
          });
          return;
        }

        if (!isMac && !isLinux) {
          return;
        }
        await window.setEffects({
          effects: [Effect.HudWindow],
          state: EffectState.Active,
          radius: 16,
        });
      } catch (error) {
        if (cancelled || !onDebug) {
          return;
        }
        onDebug({
          id: `${Date.now()}-client-liquid-glass-error`,
          timestamp: Date.now(),
          source: "error",
          label: "liquid-glass/apply-error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void apply().finally(() => {
      if (!cancelled) {
        // 等下一帧确保 webview 已绘制成品毛玻璃态再显示窗口
        requestAnimationFrame(() => {
          void showWindowOnce();
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onDebug, reduceTransparency]);
}
