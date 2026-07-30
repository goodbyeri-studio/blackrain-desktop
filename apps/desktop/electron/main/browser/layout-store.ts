import {
  BrowserLayoutUpdateSchema,
  type BrowserLayoutAck,
  type BrowserLayoutUpdate,
} from "../../shared/browser-layout";

type StoredLayout = {
  update: BrowserLayoutUpdate;
};

export class BrowserLayoutStore {
  readonly #layouts = new Map<number, StoredLayout>();

  update(
    webContentsId: number,
    expectedWindowGeneration: number,
    input: unknown,
  ): BrowserLayoutAck {
    const update = BrowserLayoutUpdateSchema.parse(input);
    if (update.windowGeneration !== expectedWindowGeneration) {
      throw new Error("Browser layout 的 window generation 已失效");
    }

    const current = this.#layouts.get(webContentsId);
    if (current && update.layoutRevision <= current.update.layoutRevision) {
      throw new Error("Browser layout revision 必须单调递增");
    }

    this.#layouts.set(webContentsId, { update });
    return { accepted: true, layoutRevision: update.layoutRevision };
  }

  remove(webContentsId: number): void {
    this.#layouts.delete(webContentsId);
  }
}
