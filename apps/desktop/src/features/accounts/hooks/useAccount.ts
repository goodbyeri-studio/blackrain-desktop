// 002-accounts-credits / M-A1：账号状态 hook。
// 维护鉴权状态机，封装登录/注册/登出，登录后拉 profile 并随 auth 变化刷新。
// UI 只消费此 hook，不直接碰 SDK / 服务层。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchProfile,
  getCurrentSession,
  signIn as svcSignIn,
  signOut as svcSignOut,
  signUp as svcSignUp,
  toAccountSession,
} from "../accountService";
import { isSupabaseConfigured } from "../config";
import { getSupabaseClient } from "../supabaseClient";
import type { AccountSession, AccountState } from "../types";

const UNCONFIGURED: AccountState = {
  status: "unconfigured",
  session: null,
  profile: null,
  error: null,
};

export interface UseAccountResult extends AccountState {
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function useAccount(): UseAccountResult {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<AccountState>(
    configured
      ? { status: "loading", session: null, profile: null, error: null }
      : UNCONFIGURED,
  );
  // 防卸载后 setState。
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 拉 profile 并合入状态（登录后、刷新时调用）。
  const loadProfile = useCallback(async (session: AccountSession) => {
    try {
      const profile = await fetchProfile(session.userId);
      if (mounted.current) {
        setState({ status: "signed-in", session, profile, error: null });
      }
    } catch (error) {
      // profile 拉取失败不阻断登录态：仍视为已登录，余额展示降级。
      if (mounted.current) {
        setState({
          status: "signed-in",
          session,
          profile: null,
          error: errorMessage(error),
        });
      }
    }
  }, []);

  // 初始恢复会话 + 订阅 auth 变化。
  useEffect(() => {
    if (!configured) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setState(UNCONFIGURED);
      return;
    }

    let active = true;

    // 重开 App：从钥匙串恢复会话。
    void (async () => {
      try {
        const session = await getCurrentSession();
        if (!active || !mounted.current) {
          return;
        }
        if (session) {
          await loadProfile(session);
        } else {
          setState({ status: "signed-out", session: null, profile: null, error: null });
        }
      } catch (error) {
        if (active && mounted.current) {
          setState({
            status: "signed-out",
            session: null,
            profile: null,
            error: errorMessage(error),
          });
        }
      }
    })();

    // 订阅登录/登出/token 刷新事件，保持状态同步。
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) {
        return;
      }
      const accountSession = toAccountSession(session);
      if (accountSession) {
        void loadProfile(accountSession);
      } else {
        setState({ status: "signed-out", session: null, profile: null, error: null });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null }));
    const session = await svcSignIn(email, password);
    if (session && mounted.current) {
      await loadProfile(session);
    }
  }, [loadProfile]);

  const signUp = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null }));
    await svcSignUp(email, password);
    // 注册后是否自动登录取决于 Supabase 邮箱确认设置；
    // onAuthStateChange 会处理已建立的会话。
  }, []);

  const signOut = useCallback(async () => {
    await svcSignOut();
    if (mounted.current) {
      setState({ status: "signed-out", session: null, profile: null, error: null });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.session) {
      await loadProfile(state.session);
    }
  }, [state.session, loadProfile]);

  return useMemo<UseAccountResult>(
    () => ({ ...state, signIn, signUp, signOut, refreshProfile }),
    [state, signIn, signUp, signOut, refreshProfile],
  );
}
