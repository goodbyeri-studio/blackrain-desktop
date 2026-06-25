// 002-accounts-credits / M-A2：会话 → 网关 credit 模式同步。
// 订阅 Supabase auth 变化：
//  - 登录/有会话 → 写 JWT 文件；若从 dev 切到 credit（base_url 变）则重启网关。
//  - token 刷新 → 只重写 JWT 文件（网关每请求读文件，无需重启）。
//  - 登出 → 清 JWT 文件 + 重启网关回 dev 模式。
// 非 Tauri / 未配置 Supabase 时整体 no-op。

import { useEffect, useRef } from "react";
import {
  modelGatewayCreditJwtClear,
  modelGatewayCreditJwtSet,
  modelGatewayDaemonRestart,
} from "@services/tauri";
import { getSupabaseClient } from "../supabaseClient";
import { isSupabaseConfigured } from "../config";

type Mode = "credit" | "dev";

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export function useCreditGatewaySync(): void {
  // 记录上一次生效模式，用于判断是否需要重启网关（base_url 变才重启）。
  const lastMode = useRef<Mode | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !hasTauri()) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }
    let active = true;

    async function applyCredit(jwt: string) {
      // 先写文件（无论是否重启都要最新 token）。
      try {
        await modelGatewayCreditJwtSet(jwt);
      } catch (error) {
        console.warn("写 credit JWT 失败。", { error });
        return;
      }
      // 仅 dev→credit（或首次）时重启换 base_url；credit→credit（刷新）不重启。
      if (lastMode.current !== "credit") {
        lastMode.current = "credit";
        try {
          await modelGatewayDaemonRestart();
        } catch (error) {
          console.warn("切 credit 模式重启网关失败。", { error });
        }
      }
    }

    async function applyDev() {
      try {
        await modelGatewayCreditJwtClear();
      } catch (error) {
        console.warn("清 credit JWT 失败。", { error });
      }
      if (lastMode.current === "credit") {
        lastMode.current = "dev";
        try {
          await modelGatewayDaemonRestart();
        } catch (error) {
          console.warn("回 dev 模式重启网关失败。", { error });
        }
      } else {
        lastMode.current = "dev";
      }
    }

    // 初始：读当前会话定调。
    void (async () => {
      const { data } = await client.auth.getSession();
      if (!active) {
        return;
      }
      const token = data.session?.access_token;
      if (token) {
        await applyCredit(token);
      } else {
        await applyDev();
      }
    })();

    // 订阅后续变化。TOKEN_REFRESHED 只重写文件（applyCredit 内已判断不重启）。
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }
      const token = session?.access_token;
      if (token) {
        void applyCredit(token);
      } else {
        void applyDev();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
}
