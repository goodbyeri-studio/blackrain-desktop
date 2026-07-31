import readline from "node:readline";
import { spawn } from "node:child_process";

const input = readline.createInterface({ input: process.stdin });
let descendantPid = null;
let activeThreadId = "thread-browser-1";
if (process.env.BLACKRAIN_FAKE_KEEP_ALIVE === "1") {
  setInterval(() => undefined, 60_000);
}
if (process.env.BLACKRAIN_FAKE_SPAWN_DESCENDANT === "1") {
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(() => undefined, 60000)"],
    { stdio: "ignore", windowsHide: true },
  );
  descendantPid = descendant.pid ?? null;
}

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: { serverInfo: { name: "fake-codex", version: "test" } },
    });
    return;
  }
  if (message.method === "initialized") {
    process.stderr.write("fake app-server ready\n");
    send({
      method: "test/environment",
      params: { codexHome: process.env.CODEX_HOME },
    });
    if (descendantPid) {
      send({ method: "test/descendant-started", params: { pid: descendantPid } });
    }
    send({
      id: "server-request-1",
      method: "item/commandExecution/requestApproval",
      params: { command: "git status" },
    });
    return;
  }
  if (message.id === "server-request-1" && message.result) {
    send({
      method: "test/server-request-completed",
      params: { decision: message.result.decision },
    });
    return;
  }
  if (message.method === "thread/list") {
    send({ method: "test/thread-list-params", params: message.params });
    send({
      id: message.id,
      result: {
        data: [{ id: "thread-1", cwd: process.cwd() }],
        nextCursor: "next-page",
      },
    });
    return;
  }
  if (message.method === "thread/start") {
    activeThreadId = "thread-browser-1";
    send({ id: message.id, result: { thread: { id: activeThreadId } } });
    send({
      method: "thread/started",
      params: { thread: { id: "thread-child-1", cwd: process.cwd() } },
    });
    send({
      method: "test/dynamic-tools",
      params: { dynamicTools: message.params.dynamicTools },
    });
    return;
  }
  if (message.method === "thread/resume") {
    activeThreadId = message.params.threadId;
    send({
      id: message.id,
      result: {
        thread: { id: activeThreadId, cwd: message.params.cwd ?? process.cwd() },
      },
    });
    send({ method: "test/thread-resume-params", params: message.params });
    return;
  }
  if (message.id === "approval-after-turn-start") {
    send({
      method: "test/approval-result",
      params: message.result ?? message.error,
    });
    return;
  }
  if (message.method === "turn/start") {
    send({ method: "test/turn-start-params", params: message.params });
    send({
      method: "turn/started",
      params: {
        threadId: activeThreadId,
        turn: { id: "turn-browser-1" },
      },
    });
    send({ id: message.id, result: { turn: { id: "turn-browser-1" } } });
    send({
      method: "item/started",
      params: {
        threadId: activeThreadId,
        turnId: "turn-browser-1",
        item: { id: "item-browser-1", type: "agentMessage" },
      },
    });
    send({
      method: "item/agentMessage/delta",
      params: {
        threadId: activeThreadId,
        turnId: "turn-browser-1",
        itemId: "item-browser-1",
        delta: "fixture delta",
      },
    });
    send({
      method: "item/completed",
      params: {
        threadId: activeThreadId,
        turnId: "turn-browser-1",
        item: { id: "item-browser-1", type: "agentMessage", text: "fixture delta" },
      },
    });
    if (
      process.env.BLACKRAIN_FAKE_APPROVAL_AFTER_TURN_START === "1" ||
      process.env.BLACKRAIN_FAKE_CANCEL_APPROVAL_AFTER_TURN_START === "1"
    ) {
      send({
        id: "approval-after-turn-start",
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: activeThreadId,
          turnId: "turn-browser-1",
          command: "git status",
        },
      });
      if (process.env.BLACKRAIN_FAKE_CANCEL_APPROVAL_AFTER_TURN_START === "1") {
        setImmediate(() =>
          send({
            method: "$/cancelRequest",
            params: { id: "approval-after-turn-start" },
          }),
        );
      }
    }
    if (process.env.BLACKRAIN_FAKE_EXIT_AFTER_TURN_STARTED === "1") {
      setImmediate(() => process.exit(17));
      return;
    }
    if (process.env.BLACKRAIN_FAKE_HOLD_TURN_OPEN !== "1") {
      send({
        id: "browser-tool-1",
        method: "item/tool/call",
        params: {
          threadId: activeThreadId,
          turnId: "turn-browser-1",
          callId: "call-browser-1",
          namespace: "blackrain_browser",
          tool: "list_tabs",
          arguments: {},
        },
      });
    }
    return;
  }
  if (message.method === "turn/interrupt") {
    send({ method: "test/turn-interrupt-params", params: message.params });
    send({ id: message.id, result: {} });
    send({
      method: "turn/completed",
      params: {
        threadId: activeThreadId,
        turn: { id: message.params.turnId },
      },
    });
    return;
  }
  if (message.method === "turn/steer") {
    send({ method: "test/turn-steer-params", params: message.params });
    send({ id: message.id, result: { turnId: message.params.expectedTurnId } });
    return;
  }
  if (message.method === "thread/unsubscribe") {
    send({ id: message.id, result: { status: "unsubscribed" } });
    return;
  }
  if (message.id === "browser-tool-1") {
    send({
      method: "test/browser-tool-result",
      params: message.result ?? message.error,
    });
    send({
      method: "turn/completed",
      params: {
        threadId: activeThreadId,
        turn: { id: "turn-browser-1" },
      },
    });
  }
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
