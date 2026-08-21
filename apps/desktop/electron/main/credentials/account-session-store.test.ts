import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSessionStore } from "./account-session-store";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createEncryption(available = true) {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) =>
      value.toString("utf8").replace(/^encrypted:/, "")
    ),
  };
}

describe("AccountSessionStore", () => {
  it("只持久化加密结果并支持读取和清除", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-session-"));
    temporaryRoots.push(root);
    const filePath = path.join(root, "credentials", "sessions.json");
    const encryption = createEncryption();
    const store = new AccountSessionStore(filePath, encryption);

    store.set({ key: "supabase", value: "secret-session" });
    const onDisk = readFileSync(filePath, "utf8");
    expect(onDisk).not.toContain("secret-session");
    expect(new AccountSessionStore(filePath, encryption).get({ key: "supabase" }))
      .toBe("secret-session");

    store.clear({ key: "supabase" });
    expect(store.get({ key: "supabase" })).toBeNull();
  });

  it("系统加密不可用时拒绝明文降级", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-session-"));
    temporaryRoots.push(root);
    const store = new AccountSessionStore(
      path.join(root, "sessions.json"),
      createEncryption(false),
    );

    expect(() => store.set({ key: "supabase", value: "secret" }))
      .toThrow("拒绝保存账户会话");
  });
});
