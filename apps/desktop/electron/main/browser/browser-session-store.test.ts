import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSessionStore } from "./browser-session-store";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("BrowserSessionStore", () => {
  it("原子保存并按 thread/route 恢复 tab 元数据", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(10).mockReturnValueOnce(20);
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-browser-state-"));
    roots.push(root);
    const filePath = path.join(root, "browser-tabs.json");
    const store = new BrowserSessionStore(filePath);
    store.upsert({
      browserTabId: "tab-1",
      threadId: "thread-1",
      routeKey: "browser-sidebar",
      url: "https://example.com/",
      title: "Example",
      viewGeneration: 1,
    });
    store.upsert({
      browserTabId: "tab-2",
      threadId: "thread-2",
      routeKey: "browser-sidebar",
      url: "about:blank",
      title: "",
      viewGeneration: 2,
    });

    const restored = new BrowserSessionStore(filePath);
    expect(
      restored.list({ threadId: "thread-1", routeKey: "browser-sidebar" }),
    ).toEqual([
      expect.objectContaining({
        browserTabId: "tab-1",
        url: "https://example.com/",
        touchedAt: 10,
      }),
    ]);
    expect(JSON.parse(readFileSync(filePath, "utf8")).schemaVersion).toBe(1);
  });

  it("忽略损坏状态且不执行任意恢复", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-browser-state-"));
    roots.push(root);
    const filePath = path.join(root, "browser-tabs.json");
    writeFileSync(filePath, '{"schemaVersion":1,"tabs":[{"url":"file:///x"}]}');
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const store = new BrowserSessionStore(filePath);
    expect(
      store.list({ threadId: "thread-1", routeKey: "browser-sidebar" }),
    ).toEqual([]);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
