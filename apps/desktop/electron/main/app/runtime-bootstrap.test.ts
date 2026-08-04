import { describe, expect, it, vi } from "vitest";
import {
  RuntimeBootstrapCoordinator,
  RuntimeDiagnostics,
} from "./runtime-bootstrap";

type FakeRuntime = {
  start: () => Promise<unknown>;
  readAccount: () => Promise<unknown>;
  status: () => { state: "idle" | "starting" | "ready" | "stopping" | "stopped" | "failed" };
};

function fakeRuntime(overrides: Partial<FakeRuntime> = {}) {
  return {
    start: vi.fn(async () => undefined),
    readAccount: vi.fn(async () => ({ account: { email: "tester@example.com" } })),
    status: vi.fn(() => ({ state: "ready" as const })),
    ...overrides,
  } as FakeRuntime;
}

describe("RuntimeBootstrapCoordinator", () => {
  it("诊断缓冲会脱敏凭据和本机绝对路径", () => {
    const diagnostics = new RuntimeDiagnostics();
    diagnostics.record("token=abc123 failed at C:\\Users\\tester\\.codex\\auth.json");
    expect(diagnostics.snapshot()).toEqual([
      "token=[redacted] failed at <path>",
    ]);
  });

  it("启动唯一 app-server 并识别已登录 Home", async () => {
    const runtime = fakeRuntime();
    const coordinator = new RuntimeBootstrapCoordinator({
      runtime,
      environment: { USERPROFILE: "C:\\Users\\tester" },
    });

    const status = await coordinator.initialize();
    expect(status.phase).toBe("ready");
    expect(status.codexHomeId).toMatch(/^[a-f0-9]{32}$/);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.readAccount).toHaveBeenCalledTimes(1);
  });

  it("无 Codex 账户时保持可见的未登录状态，并允许幂等初始化", async () => {
    const runtime = fakeRuntime({
      readAccount: vi.fn(async () => ({ account: null })),
    });
    const coordinator = new RuntimeBootstrapCoordinator({ runtime });

    await expect(coordinator.initialize()).resolves.toMatchObject({
      phase: "unauthenticated",
    });
    await coordinator.initialize();
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });

  it("启动失败进入 degraded，重试只复用 Electron runtime", async () => {
    const start = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("spawn codex.exe failed"))
      .mockResolvedValueOnce(undefined);
    const runtime = fakeRuntime({ start });
    const diagnostics = new RuntimeDiagnostics();
    const coordinator = new RuntimeBootstrapCoordinator({
      runtime,
      diagnostics,
      environment: { USERPROFILE: "C:\\Users\\tester" },
      now: () => "2026-08-04T00:00:00.000Z",
    });

    await expect(coordinator.initialize()).resolves.toMatchObject({
      phase: "degraded",
      error: expect.stringContaining("spawn codex.exe failed"),
    });
    await expect(coordinator.initialize(true)).resolves.toMatchObject({
      phase: "ready",
    });
    expect(start).toHaveBeenCalledTimes(2);
    const report = coordinator.exportDiagnostics();
    expect(report.content).toContain('"schemaVersion": 1');
    expect(report.content).toContain("bootstrap: spawn codex.exe failed");
    expect(report.content).not.toContain("C:\\Users\\tester");
  });
});
