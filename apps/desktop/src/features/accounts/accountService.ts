// 002-accounts-credits / M-A1.3：账号服务层。
// 把 Supabase Auth + profiles 查询收口到一处，hook/UI 只调这里，不直接碰 SDK。

import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import type {
  AccountPlan,
  AccountProfile,
  AccountSession,
} from "./types";
import { ACCOUNT_PLANS } from "./types";

export class AccountBackendUnavailable extends Error {
  constructor() {
    super("账号后端未配置。请在 .env.local 填 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。");
    this.name = "AccountBackendUnavailable";
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new AccountBackendUnavailable();
  }
  return client;
}

// Supabase Session → 公开会话视图（剥离敏感 token）。
export function toAccountSession(session: Session | null): AccountSession | null {
  if (!session?.user) {
    return null;
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    expiresAt: session.expires_at ?? null,
  };
}

// 规整 plan 文本到合法枚举，非法值回退 free。
function normalizePlan(value: unknown): AccountPlan {
  return ACCOUNT_PLANS.includes(value as AccountPlan)
    ? (value as AccountPlan)
    : "free";
}

// 注册（邮箱+密码）。trigger 会建 profile + 赠送 credit。
export async function signUp(email: string, password: string): Promise<User | null> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
  return data.user;
}

// 登录（邮箱+密码）。
export async function signIn(email: string, password: string): Promise<AccountSession | null> {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return toAccountSession(data.session);
}

// 登出。清钥匙串里的 session（SDK storage adapter 自动调 removeItem）。
export async function signOut(): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

// 取当前会话（重开 App 时从钥匙串恢复，SDK 自动校验/刷新）。
export async function getCurrentSession(): Promise<AccountSession | null> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  return toAccountSession(data.session);
}

// 查当前用户 profile（plan + credit 余额）。RLS 保证只能读自己的行。
export async function fetchProfile(userId: string): Promise<AccountProfile | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, plan, credits, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id as string,
    plan: normalizePlan(data.plan),
    credits: Number(data.credits ?? 0),
    createdAt: (data.created_at as string | null) ?? null,
  };
}
