// 002-accounts-credits / M-A1：Supabase 连接配置。
// 走 Vite 的 import.meta.env（VITE_ 前缀才会注入前端）。
// 仅 URL + anon key 可进前端——anon key 受 RLS 约束，是公开可分发的；
// service-role key 绝不进前端（只在平台代理服务端，见 design.md）。
//
// 本地开发：在 apps/desktop/.env.local 填
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
// 未配置时 isSupabaseConfigured() 返回 false，UI 走「后端未配置」降级，不崩。

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const RAW_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function isSupabaseConfigured(): boolean {
  return RAW_URL.length > 0 && RAW_ANON_KEY.length > 0;
}

// 已配置时返回配置；未配置返回 null（调用方据此走降级 UI，而非抛错）。
export function readSupabaseConfig(): SupabaseConfig | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  return { url: RAW_URL, anonKey: RAW_ANON_KEY };
}
