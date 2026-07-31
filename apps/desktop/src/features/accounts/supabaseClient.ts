// Supabase 客户端单例。
// 惰性创建：未配置（缺 env）时返回 null，调用方走降级 UI。
// session 持久化走钥匙串 adapter（keychainStorage），不落 localStorage。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";
import { keychainSessionStorage } from "./keychainStorage";

let cached: SupabaseClient | null = null;
let attempted = false;

// 取 Supabase 客户端；未配置返回 null（只尝试创建一次）。
export function getSupabaseClient(): SupabaseClient | null {
  if (attempted) {
    return cached;
  }
  attempted = true;

  const config = readSupabaseConfig();
  if (!config) {
    cached = null;
    return null;
  }

  cached = createClient(config.url, config.anonKey, {
    auth: {
      // 钥匙串 adapter：session 进系统凭据库，不落明文 localStorage。
      storage: keychainSessionStorage,
      persistSession: true,
      autoRefreshToken: true, // 静默刷新 access token（M-A1.4）。
      // 桌面 App 无 URL 回调，禁用 URL session 检测。
      detectSessionInUrl: false,
    },
  });
  return cached;
}

// 测试用：重置单例缓存。
export function __resetSupabaseClientForTests(): void {
  cached = null;
  attempted = false;
}
