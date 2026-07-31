import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateLock, verifyRuntime } from "./verify-codex-runtime.mjs";

const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

export async function probeBrowserRuntimeSeam() {
  if (process.platform !== "win32") {
    throw new Error("Browser runtime seam 探针仅支持 Windows x64 锁定制品");
  }

  const lockPath = path.join(desktopRoot, "resources", "codex", "runtime-lock.json");
  const runtimeRoot = path.join(desktopRoot, "resources", "codex", "windows-x64");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const { platform } = validateLock(lock);
  await verifyRuntime(lock, platform, { runtimeRoot });

  const hostPath = path.join(runtimeRoot, "bin", "codex-code-mode-host.exe");
  const browserClientPath = path.join(
    desktopRoot,
    "resources",
    "browser-client",
    "browser-client.mjs",
  );
  const host = new CodeModeHostProbe(hostPath);
  await host.start();

  try {
    await host.openSession("blackrain-browser-seam-probe");
    const execution = await host.execute(
      "blackrain-browser-seam-probe",
      "text('code-mode-execute-ok')",
    );
    const nodeGlobal = await host.execute(
      "blackrain-browser-seam-probe",
      "text(typeof process); text(typeof require)",
    );
    const nodeImport = await host.execute(
      "blackrain-browser-seam-probe",
      "await import('node:net')",
    );
    const clientImport = await host.execute(
      "blackrain-browser-seam-probe",
      `await import(${JSON.stringify(pathToFileUrl(browserClientPath))})`,
    );
    const cancellation = await host.executeAndTerminate(
      "blackrain-browser-seam-probe",
      "await new Promise(() => {})",
    );
    await host.shutdownSession("blackrain-browser-seam-probe");

    const executionPassed =
      execution.errorText === null &&
      execution.text.includes("code-mode-execute-ok");
    const nodeModuleLoadingAvailable =
      nodeImport.errorText === null && clientImport.errorText === null;
    const supported = executionPassed && nodeModuleLoadingAvailable;
    const gatePassed =
      executionPassed &&
      cancellation.terminated &&
      host.closedCells.includes(cancellation.cellId) &&
      !nodeModuleLoadingAvailable;

    return {
      schemaVersion: 1,
      runtime: {
        tag: lock.upstream.tag,
        commit: lock.upstream.commit,
        platform: "windows-x64",
      },
      seam: {
        protocolVersion: 1,
        executionPassed,
        cancellationPassed: cancellation.terminated,
        cleanupPassed: host.closedCells.includes(cancellation.cellId),
        nodeGlobals: nodeGlobal.text,
        nodeImportError: nodeImport.errorText,
        browserClientImportError: clientImport.errorText,
        nodeModuleLoadingAvailable,
      },
      supported,
      gatePassed,
      decision: gatePassed
        ? "code-mode V8 保持无 Node 隔离；生产 Browser client 继续使用标准 stdio MCP adapter"
        : supported
          ? "公开 code-mode 接缝意外获得 Node 模块加载能力，需要重新评审 Browser runtime 边界"
          : "code-mode 执行、取消、清理或无 Node 隔离合同失败",
    };
  } finally {
    await host.close();
  }
}

class CodeModeHostProbe {
  constructor(executablePath) {
    this.executablePath = executablePath;
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.messages = [];
    this.waiters = [];
    this.closedCells = [];
  }

  async start() {
    this.child = spawn(this.executablePath, ["--listen", "stdio"], {
      cwd: desktopRoot,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.on("data", (chunk) => {
      const line = chunk.toString("utf8").trim();
      if (line) this.lastDiagnostic = line;
    });
    this.child.once("exit", (code) => this.rejectWaiters(
      new Error(`code-mode host 提前退出（code=${code ?? "null"}）`),
    ));
    await this.waitForSpawn();
    this.write({
      type: "connection/hello",
      supportedVersions: [1],
      requiredCapabilities: [],
      optionalCapabilities: [],
    });
    const ready = await this.read((message) => message.type === "connection/ready");
    if (ready.selectedVersion !== 1) {
      throw new Error("code-mode host 未协商 protocol v1");
    }
  }

  async openSession(sessionId) {
    const response = await this.operation({ method: "session/open", sessionId });
    if (response?.type !== "session/ready" || response.sessionId !== sessionId) {
      throw new Error("code-mode host session/open 响应非法");
    }
  }

  async execute(sessionId, source, yieldTimeMs = null) {
    const id = this.nextId++;
    this.write({
      type: "operation/request",
      id,
      request: {
        method: "session/execute",
        sessionId,
        request: {
          tool_call_id: `probe-${id}`,
          enabled_tools: [],
          source,
          yield_time_ms: yieldTimeMs,
          max_output_tokens: 4096,
        },
      },
    });
    const initial = await this.read(
      (message) => message.type === "execute/initialResponse" && message.id === id,
    );
    const value = unwrapResult(initial.result);
    return normalizeRuntimeResponse(value);
  }

  async executeAndTerminate(sessionId, source) {
    const yielded = await this.execute(sessionId, source, 1);
    if (yielded.kind !== "Yielded") {
      throw new Error(`code-mode host 未 yield 长任务：${yielded.kind}`);
    }
    const response = await this.operation({
      method: "session/terminate",
      sessionId,
      cellId: yielded.cellId,
    });
    const outcome = response?.outcome;
    const runtime = outcome?.LiveCell ?? outcome?.MissingCell;
    return {
      cellId: yielded.cellId,
      terminated: Boolean(runtime?.Terminated),
    };
  }

  async shutdownSession(sessionId) {
    const response = await this.operation({ method: "session/shutdown", sessionId });
    if (response?.type !== "session/closed") {
      throw new Error("code-mode host session/shutdown 响应非法");
    }
  }

  async operation(request) {
    const id = this.nextId++;
    this.write({ type: "operation/request", id, request });
    const response = await this.read(
      (message) => message.type === "operation/response" && message.id === id,
    );
    return unwrapResult(response.result);
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_FRAME_BYTES) {
        this.rejectWaiters(new Error("code-mode host 返回非法 frame 长度"));
        this.child?.kill();
        return;
      }
      if (this.buffer.length < length + 4) return;
      const message = JSON.parse(this.buffer.subarray(4, length + 4).toString("utf8"));
      this.buffer = this.buffer.subarray(length + 4);
      if (message.type === "cell/closed") this.closedCells.push(message.cellId);
      const waiterIndex = this.waiters.findIndex(({ predicate }) => predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    }
  }

  write(message) {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32LE(payload.length, 0);
    payload.copy(frame, 4);
    this.child.stdin.write(frame);
  }

  read(predicate) {
    const index = this.messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`code-mode host 响应超时${this.lastDiagnostic ? `：${this.lastDiagnostic}` : ""}`));
      }, 10_000);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  waitForSpawn() {
    return new Promise((resolve, reject) => {
      this.child.once("spawn", resolve);
      this.child.once("error", reject);
    });
  }

  async close() {
    if (!this.child || this.child.exitCode !== null) return;
    this.child.stdin.end();
    const exited = new Promise((resolve) => this.child.once("exit", resolve));
    const timeout = new Promise((resolve) => setTimeout(resolve, 2_000, "timeout"));
    if ((await Promise.race([exited, timeout])) === "timeout") this.child.kill();
  }
}

function unwrapResult(result) {
  if (result?.status === "ok") return result.value;
  throw new Error(String(result?.message ?? "code-mode host 操作失败"));
}

function normalizeRuntimeResponse(value) {
  for (const kind of ["Result", "Yielded", "Terminated"]) {
    const response = value?.[kind];
    if (!response) continue;
    return {
      kind,
      cellId: response.cell_id,
      text: (response.content_items ?? [])
        .filter((item) => item.type === "input_text")
        .map((item) => item.text)
        .join("\n"),
      errorText: response.error_text ?? null,
    };
  }
  throw new Error("code-mode host runtime response 非法");
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replaceAll("\\", "/").replaceAll(" ", "%20")}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await probeBrowserRuntimeSeam();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (process.argv.includes("--gate") && !result.gatePassed) process.exitCode = 2;
}
