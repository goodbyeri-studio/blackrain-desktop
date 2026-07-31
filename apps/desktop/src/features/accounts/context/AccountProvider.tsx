// 登录开屏使用的账号单一真源 context。
// 全 App 共享一套鉴权状态机 + 订阅，避免多组件各跑一套打架。
// 门禁、首页、设置、积分条都读它。
//
// 离线态（online）派生：
//  - signed-in 且 profile 已加载 → 在线（credit 功能可用）。
//  - signed-in 但 profile 为 null 且带 error → 缓存会话在、后端连不上（离线，credit 降级）。
// 见 decisions「会话优先 + 离线只放 BYOK/本地」。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchProfile,
  getCurrentSession,
  resendSignupOtp as svcResendSignupOtp,
  signIn as svcSignIn,
  signOut as svcSignOut,
  signUp as svcSignUp,
  verifySignupOtp as svcVerifySignupOtp,
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

export interface AccountContextValue extends AccountState {
  // 在线 = 后端可达且 profile 已取到。离线缓存会话时为 false（credit 降级）。
  online: boolean;
  signIn(email: string, password: string): Promise<void>;
  // 注册：创建未确认用户并发验证码邮件（不登录，需再 verifySignupOtp）。
  signUp(email: string, password: string): Promise<void>;
  // 校验注册验证码：成功即确认邮箱并自动登录、加载 profile。
  verifySignupOtp(email: string, token: string): Promise<void>;
  // 重发注册验证码。
  resendSignupOtp(email: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

// 无 Provider 时的安全默认（unconfigured）。生产中 App 层永远包 Provider；
// 此默认让独立渲染的组件测试/边缘场景不崩。
const NO_PROVIDER_FALLBACK: AccountContextValue = {
  status: "unconfigured",
  session: null,
  profile: null,
  error: null,
  online: false,
  signIn: async () => {},
  signUp: async () => {},
  verifySignupOtp: async () => {},
  resendSignupOtp: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<AccountState>(
    configured
      ? { status: "loading", session: null, profile: null, error: null }
      : UNCONFIGURED,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 拉 profile：成功→在线已登录；失败→仍已登录但 profile 空 + error（离线缓存会话）。
  const loadProfile = useCallback(async (session: AccountSession) => {
    try {
      const profile = await fetchProfile(session.userId);
      if (mounted.current) {
        setState({ status: "signed-in", session, profile, error: null });
      }
    } catch (error) {
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

    // 重开 App：从钥匙串恢复会话（getSession 默认读本地存储，不强依赖网络）。
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

  const signIn = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, error: null }));
      const session = await svcSignIn(email, password);
      if (session && mounted.current) {
        await loadProfile(session);
      }
    },
    [loadProfile],
  );

  const signUp = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null }));
    await svcSignUp(email, password);
  }, []);

  const verifySignupOtp = useCallback(
    async (email: string, token: string) => {
      setState((prev) => ({ ...prev, error: null }));
      const session = await svcVerifySignupOtp(email, token);
      if (session && mounted.current) {
        await loadProfile(session);
      }
    },
    [loadProfile],
  );

  const resendSignupOtp = useCallback(async (email: string) => {
    await svcResendSignupOtp(email);
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

  const value = useMemo<AccountContextValue>(
    () => ({
      ...state,
      online: state.status === "signed-in" && state.profile !== null,
      signIn,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signOut,
      refreshProfile,
    }),
    [state, signIn, signUp, verifySignupOtp, resendSignupOtp, signOut, refreshProfile],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

// 读账号 context。无 Provider 时返回 unconfigured 默认（不抛），
// 兼容独立渲染的组件测试；生产中 App 层永远包 Provider。
export function useAccount(): AccountContextValue {
  return useContext(AccountContext) ?? NO_PROVIDER_FALLBACK;
}

// 容忍 Provider 缺失的版本（供少数边缘组件/测试用），缺失时返回 null。
export function useAccountOptional(): AccountContextValue | null {
  return useContext(AccountContext);
}
