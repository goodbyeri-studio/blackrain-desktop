import { describe, expect, it } from "vitest";
import { AppWindowRegistry } from "./window-registry";

describe("AppWindowRegistry", () => {
  it("只接受已注册且角色匹配的 sender", () => {
    const registry = new AppWindowRegistry();
    registry.register({ webContentsId: 4, role: "main", generation: 2 });
    expect(registry.require(4, "main").generation).toBe(2);
    expect(() => registry.require(4, "about")).toThrow(/sender/);
    expect(() => registry.require(5, "main")).toThrow(/sender/);
  });

  it("拒绝重复注册并支持注销", () => {
    const registry = new AppWindowRegistry();
    registry.register({ webContentsId: 4, role: "main", generation: 1 });
    expect(() =>
      registry.register({ webContentsId: 4, role: "main", generation: 2 }),
    ).toThrow(/已注册/);
    registry.unregister(4);
    expect(() => registry.require(4, "main")).toThrow();
  });
});
