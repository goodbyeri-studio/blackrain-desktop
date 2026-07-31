// Supabase SDK 的钥匙串 storage adapter。
// Supabase 默认把 session 存 localStorage（明文、可被扒）。桌面端改存系统钥匙串：
// 把 SDK 的 getItem/setItem/removeItem 转发到 Rust account_session_* 命令。
//
// 注意：SDK 的 storage 接口允许 async 返回，故直接返回 Promise。
// 非 Tauri 环境（如 vitest node）下，invoke 不可用——这里捕获并降级为内存 Map，
// 让纯逻辑测试不依赖原生层。

import {
  accountSessionClear,
  accountSessionGet,
  accountSessionSet,
} from "@services/tauri";

export interface AsyncStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// 内存兜底（仅非 Tauri 环境，如单测）。生产路径永远走钥匙串。
function createMemoryFallback(): AsyncStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getItem(key) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

const memoryFallback = createMemoryFallback();

// 判断是否在 Tauri 环境（有 __TAURI_INTERNALS__）。非 Tauri 时不调原生命令。
function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export const keychainSessionStorage: AsyncStorageAdapter = {
  async getItem(key) {
    if (!hasTauri()) {
      return memoryFallback.getItem(key);
    }
    try {
      return await accountSessionGet(key);
    } catch (error) {
      console.warn("读取账号会话失败，降级内存。", { error });
      return memoryFallback.getItem(key);
    }
  },
  async setItem(key, value) {
    if (!hasTauri()) {
      return memoryFallback.setItem(key, value);
    }
    try {
      await accountSessionSet(key, value);
    } catch (error) {
      console.warn("写入账号会话失败，降级内存。", { error });
      await memoryFallback.setItem(key, value);
    }
  },
  async removeItem(key) {
    if (!hasTauri()) {
      return memoryFallback.removeItem(key);
    }
    try {
      await accountSessionClear(key);
    } catch (error) {
      console.warn("清除账号会话失败，降级内存。", { error });
      await memoryFallback.removeItem(key);
    }
  },
};
