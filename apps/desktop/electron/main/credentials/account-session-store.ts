import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { z } from "zod";
import {
  AccountSessionKeyInputSchema,
  AccountSessionSetInputSchema,
} from "../../shared/desktop";

const AccountSessionFileSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.record(z.string(), z.string()),
});

type EncryptionProvider = Pick<
  typeof safeStorage,
  "isEncryptionAvailable" | "encryptString" | "decryptString"
>;

export class AccountSessionStore {
  readonly #filePath: string;
  readonly #encryption: EncryptionProvider;
  readonly #sessions = new Map<string, string>();

  constructor(filePath: string, encryption: EncryptionProvider = safeStorage) {
    this.#filePath = filePath;
    this.#encryption = encryption;
    try {
      const file = AccountSessionFileSchema.parse(
        JSON.parse(readFileSync(filePath, "utf8")),
      );
      for (const [key, encrypted] of Object.entries(file.sessions)) {
        this.#sessions.set(key, encrypted);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Electron 账户会话状态无法读取，将从空列表启动");
      }
    }
  }

  get(input: unknown): string | null {
    const { key } = AccountSessionKeyInputSchema.parse(input);
    const encrypted = this.#sessions.get(key);
    if (!encrypted) return null;
    this.#requireEncryption();
    return this.#encryption.decryptString(Buffer.from(encrypted, "base64"));
  }

  set(input: unknown): void {
    const { key, value } = AccountSessionSetInputSchema.parse(input);
    this.#requireEncryption();
    this.#sessions.set(
      key,
      this.#encryption.encryptString(value).toString("base64"),
    );
    this.#flush();
  }

  clear(input: unknown): void {
    const { key } = AccountSessionKeyInputSchema.parse(input);
    if (this.#sessions.delete(key)) this.#flush();
  }

  #requireEncryption(): void {
    if (!this.#encryption.isEncryptionAvailable()) {
      throw new Error("系统凭据加密当前不可用，拒绝保存账户会话");
    }
  }

  #flush(): void {
    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({
        schemaVersion: 1,
        sessions: Object.fromEntries(this.#sessions),
      }),
      "utf8",
    );
    renameSync(temporaryPath, this.#filePath);
  }
}
