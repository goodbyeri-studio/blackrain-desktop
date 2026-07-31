import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  bindSystemPowerEvents,
  SystemPowerLifecycle,
  type SystemPowerLifecycleTarget,
} from "./system-power-lifecycle";

function target(): SystemPowerLifecycleTarget {
  return {
    prepareForSystemSuspend: vi.fn(async () => undefined),
    resumeFromSystemSleep: vi.fn(async () => undefined),
  };
}

describe("SystemPowerLifecycle", () => {
  it("串行执行睡眠与唤醒恢复，并合并重复事件", async () => {
    const browser = target();
    const agent = target();
    const lifecycle = new SystemPowerLifecycle([browser, agent]);

    lifecycle.suspend();
    lifecycle.suspend();
    lifecycle.resume();
    lifecycle.resume();
    await lifecycle.whenIdle();

    expect(browser.prepareForSystemSuspend).toHaveBeenCalledTimes(1);
    expect(agent.prepareForSystemSuspend).toHaveBeenCalledTimes(1);
    expect(browser.resumeFromSystemSleep).toHaveBeenCalledTimes(1);
    expect(agent.resumeFromSystemSleep).toHaveBeenCalledTimes(1);
    expect(browser.prepareForSystemSuspend).toHaveBeenCalledBefore(
      vi.mocked(browser.resumeFromSystemSleep),
    );
  });

  it("单个目标失败后仍允许后续唤醒恢复", async () => {
    const errors: unknown[] = [];
    const failing = target();
    const slow = target();
    let finishSlowSuspend: (() => void) | undefined;
    vi.mocked(failing.prepareForSystemSuspend).mockRejectedValueOnce(
      new Error("suspend failed"),
    );
    vi.mocked(slow.prepareForSystemSuspend).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        finishSlowSuspend = resolve;
      }),
    );
    const lifecycle = new SystemPowerLifecycle([failing, slow], (error) =>
      errors.push(error),
    );

    lifecycle.suspend();
    lifecycle.resume();
    await vi.waitFor(() => expect(finishSlowSuspend).toBeDefined());
    expect(slow.resumeFromSystemSleep).not.toHaveBeenCalled();
    finishSlowSuspend?.();
    await lifecycle.whenIdle();

    expect(errors).toHaveLength(1);
    expect(failing.resumeFromSystemSleep).toHaveBeenCalledTimes(1);
    expect(slow.resumeFromSystemSleep).toHaveBeenCalledTimes(1);
  });

  it("绑定并释放 Electron powerMonitor 事件", async () => {
    const events = new EventEmitter();
    const browser = target();
    const lifecycle = new SystemPowerLifecycle([browser]);
    const dispose = bindSystemPowerEvents(events, lifecycle);

    events.emit("suspend");
    events.emit("resume");
    await lifecycle.whenIdle();
    dispose();
    events.emit("suspend");

    expect(browser.prepareForSystemSuspend).toHaveBeenCalledTimes(1);
    expect(browser.resumeFromSystemSleep).toHaveBeenCalledTimes(1);
  });
});
