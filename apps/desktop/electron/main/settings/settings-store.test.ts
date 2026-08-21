import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "./settings-store";

describe("SettingsStore", () => {
  it("原子持久化并重新读取设置", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "blackrain-settings-"));
    const filePath = path.join(directory, "settings.json");
    const store = new SettingsStore(filePath);

    expect(store.get()).toEqual({});
    expect(store.update({ settings: { theme: "dark", uiScale: 1.1 } })).toEqual({
      theme: "dark",
      uiScale: 1.1,
    });
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({
      schemaVersion: 1,
      settings: { theme: "dark", uiScale: 1.1 },
    });
    expect(new SettingsStore(filePath).get()).toEqual({
      theme: "dark",
      uiScale: 1.1,
    });
  });

  it("拒绝非对象和过大的设置", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "blackrain-settings-"));
    const store = new SettingsStore(path.join(directory, "settings.json"));

    expect(() => store.update({ settings: null })).toThrow();
    expect(() =>
      store.update({ settings: { payload: "x".repeat(1024 * 1024) } }),
    ).toThrow("宿主 JSON 数据超过 1 MiB");
  });
});
