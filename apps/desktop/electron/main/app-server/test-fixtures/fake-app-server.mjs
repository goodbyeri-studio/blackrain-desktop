import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });

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
    send({ id: message.id, result: { thread: { id: "thread-browser-1" } } });
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
  if (message.method === "turn/start") {
    send({ method: "test/turn-start-params", params: message.params });
    send({
      method: "turn/started",
      params: {
        threadId: "thread-browser-1",
        turn: { id: "turn-browser-1" },
      },
    });
    send({ id: message.id, result: { turn: { id: "turn-browser-1" } } });
    if (process.env.BLACKRAIN_FAKE_EXIT_AFTER_TURN_STARTED === "1") {
      setImmediate(() => process.exit(17));
      return;
    }
    send({
      id: "browser-tool-1",
      method: "item/tool/call",
      params: {
        threadId: "thread-browser-1",
        turnId: "turn-browser-1",
        callId: "call-browser-1",
        namespace: "blackrain_browser",
        tool: "list_tabs",
        arguments: {},
      },
    });
    return;
  }
  if (message.method === "turn/steer") {
    send({ method: "test/turn-steer-params", params: message.params });
    send({ id: message.id, result: { turnId: message.params.expectedTurnId } });
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
        threadId: "thread-browser-1",
        turn: { id: "turn-browser-1" },
      },
    });
  }
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
