export type AppWindowRole = "main" | "about";

export type AppWindowRecord = {
  webContentsId: number;
  role: AppWindowRole;
  generation: number;
};

export class AppWindowRegistry {
  readonly #records = new Map<number, AppWindowRecord>();

  register(record: AppWindowRecord): void {
    if (this.#records.has(record.webContentsId)) {
      throw new Error(`WebContents ${record.webContentsId} 已注册`);
    }
    this.#records.set(record.webContentsId, record);
  }

  unregister(webContentsId: number): void {
    this.#records.delete(webContentsId);
  }

  require(webContentsId: number, role: AppWindowRole): AppWindowRecord {
    const record = this.#records.get(webContentsId);
    if (!record || record.role !== role) {
      throw new Error("IPC sender 不属于允许的 App 窗口");
    }
    return record;
  }
}
