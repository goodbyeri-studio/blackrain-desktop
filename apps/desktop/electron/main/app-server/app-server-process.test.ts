import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  AppServerProcess,
  buildAppServerArguments,
} from "./app-server-process";

describe("AppServerProcess", () => {
  it("spawn 子进程并跑通 initialize、双向 request、stderr 与退出", async () => {
    const notifications: Array<{ method: string; params: unknown }> = [];
    const diagnostics: string[] = [];
    const onExit = vi.fn();
    let resolveServerRequest!: () => void;
    const serverRequestCompleted = new Promise<void>((resolve) => {
      resolveServerRequest = resolve;
    });
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const inheritedCodexHome = fileURLToPath(
      new URL("./test-data/standard-codex-home", import.meta.url),
    );
    const processSupervisor = new AppServerProcess({
      executablePath: process.execPath,
      launchArguments: [fixturePath],
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      environment: { CODEX_HOME: inheritedCodexHome },
      onExit,
      connection: {
        onDiagnostic: (line) => diagnostics.push(line),
        onServerRequest: async ({ method }) => {
          expect(method).toBe("item/commandExecution/requestApproval");
          return { decision: "accept" };
        },
        onNotification: (method, params) => {
          notifications.push({ method, params });
          if (method === "test/server-request-completed") {
            resolveServerRequest();
          }
        },
      },
    });

    const client = await processSupervisor.start();
    expect(processSupervisor.state).toBe("ready");
    await expect(client.request("thread/list")).resolves.toEqual({
      data: [{ id: "thread-1" }],
    });
    await serverRequestCompleted;
    expect(notifications).toContainEqual({
      method: "test/server-request-completed",
      params: { decision: "accept" },
    });
    expect(notifications).toContainEqual({
      method: "test/environment",
      params: { codexHome: inheritedCodexHome },
    });
    expect(diagnostics).toContain("fake app-server ready");

    await expect(processSupervisor.stop()).resolves.toMatchObject({
      code: 0,
      expected: true,
    });
    expect(processSupervisor.state).toBe("stopped");
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("构造固定的原装 codex app-server 启动参数", () => {
    expect(buildAppServerArguments(["-c", "model=example"])).toEqual([
      "-c",
      "features.code_mode_host=true",
      "-c",
      "model=example",
      "app-server",
      "--analytics-default-enabled",
    ]);
  });

  it("spawn 失败后仍可完成 stop，且退出只结算一次", async () => {
    const onExit = vi.fn();
    const processSupervisor = new AppServerProcess({
      executablePath: fileURLToPath(
        new URL("./test-fixtures/does-not-exist.exe", import.meta.url),
      ),
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      onExit,
    });

    await expect(processSupervisor.start()).rejects.toThrow();
    await expect(processSupervisor.stop()).resolves.toMatchObject({
      code: null,
      signal: null,
      expected: false,
    });
    expect(processSupervisor.state).toBe("failed");
    expect(onExit).toHaveBeenCalledOnce();
  });
});
