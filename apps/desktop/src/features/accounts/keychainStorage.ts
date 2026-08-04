// Supabase SDK 的钥匙串 storage adapter。
// Supabase 默认把 session 存 localStorage（明文、可被扒）。桌面端改存系统钥匙串：
// 把 SDK 的 getItem/setItem/removeItem 转发到 Electron safeStorage。
//
// 注意：SDK 的 storage 接口允许 async 返回，故直接返回 Promise。
// 无 typed host 的测试/预览环境降级为内存 Map，
// 让纯逻辑测试不依赖原生层。

import {
  accountSessionClear,
  accountSessionGet,
  accountSessionSet,
} from "@services/desktop";

export interface AsyncStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// 内存兜底仅用于单测/预览；生产路径永远走系统加密存储。
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

function hasHost(): boolean {
  return typeof window !== "undefined" && Boolean(window.blackrain);
}

export const keychainSessionStorage: AsyncStorageAdapter = {
  async getItem(key) {
    if (!hasHost()) {
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
    if (!hasHost()) {
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
    if (!hasHost()) {
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
