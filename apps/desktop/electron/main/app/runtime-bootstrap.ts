import { codexHomeId } from "../app-server/codex-home";
import type {
  DiagnosticsExport,
  RuntimeBootstrapStatus,
} from "../../shared/ipc";

const START_TIMEOUT_MS = 20_000;
const MAX_DIAGNOSTICS = 200;

export class RuntimeDiagnostics {
  readonly #lines: string[] = [];

  record(line: string): void {
    const sanitized = line
      .replace(/[A-Z]:\\[^\s"']+/giu, "<path>")
      .replace(/\/(?:Users|home|tmp|var)\/[^\s"']+/giu, "<path>")
      .replace(/(authorization|cookie|password|secret|token|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]")
      .slice(0, 2_000);
    this.#lines.push(sanitized);
    if (this.#lines.length > MAX_DIAGNOSTICS) this.#lines.shift();
  }

  snapshot(): string[] {
    return [...this.#lines];
  }
}

export type RuntimeBootstrapPhase = RuntimeBootstrapStatus["phase"];

export type RuntimeBootstrapCoordinatorOptions = {
  runtime: RuntimeBootstrapRuntime;
  environment?: Readonly<Record<string, string | undefined>>;
  diagnostics?: RuntimeDiagnostics;
  now?: () => string;
  /** 宿主 smoke/E2E 只验证壳和 Browser，不伪造 Codex 登录结论。 */
  skipAccountProbe?: boolean;
  /** Browser 壳 E2E 不需要启动真实 codex.exe；真实 agent E2E 不设置此项。 */
  skipRuntimeStart?: boolean;
};

export type RuntimeBootstrapRuntime = {
  start(): Promise<unknown>;
  readAccount(): Promise<unknown>;
  status(): { state: string };
};

export class RuntimeBootstrapCoordinator {
  readonly #runtime: RuntimeBootstrapRuntime;
  readonly #environment: Readonly<Record<string, string | undefined>>;
  readonly #diagnostics: RuntimeDiagnostics;
  readonly #now: () => string;
  readonly #codexHomeId: string;
  readonly #skipAccountProbe: boolean;
  readonly #skipRuntimeStart: boolean;
  #status: RuntimeBootstrapStatus;
  #initializePromise?: Promise<RuntimeBootstrapStatus>;

  constructor(options: RuntimeBootstrapCoordinatorOptions) {
    this.#runtime = options.runtime;
    this.#environment = options.environment ?? process.env;
    this.#diagnostics = options.diagnostics ?? new RuntimeDiagnostics();
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#skipAccountProbe = options.skipAccountProbe ?? false;
    this.#skipRuntimeStart = options.skipRuntimeStart ?? false;
    this.#codexHomeId = codexHomeId(this.#environment);
    this.#status = {
      phase: this.#skipRuntimeStart ? "ready" : "idle",
      attempt: 0,
      codexHomeId: this.#codexHomeId,
      error: null,
    };
  }

  status(): RuntimeBootstrapStatus {
    return { ...this.#status };
  }

  diagnostics(): RuntimeDiagnostics {
    return this.#diagnostics;
  }

  async initialize(force = false): Promise<RuntimeBootstrapStatus> {
    if (this.#initializePromise) return this.#initializePromise;
    if (this.#skipRuntimeStart) return this.status();
    if (!force && (this.#status.phase === "ready" || this.#status.phase === "unauthenticated")) {
      return this.status();
    }
    this.#status = {
      ...this.#status,
      phase: "initializing",
      attempt: this.#status.attempt + 1,
      error: null,
    };
    this.#initializePromise = this.#runInitialization().finally(() => {
      this.#initializePromise = undefined;
    });
    return this.#initializePromise;
  }

  exportDiagnostics(): DiagnosticsExport {
    const report = {
      schemaVersion: 1,
      generatedAt: this.#now(),
      runtime: this.status(),
      appServerState: this.#runtime.status().state,
      diagnostics: this.#diagnostics.snapshot(),
    };
    return {
      defaultFileName: `blackrain-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      content: JSON.stringify(report, null, 2),
    };
  }

  async #runInitialization(): Promise<RuntimeBootstrapStatus> {
    try {
      await withTimeout(this.#runtime.start(), START_TIMEOUT_MS, "App Server 启动超时");
      let phase: RuntimeBootstrapPhase = "ready";
      if (!this.#skipAccountProbe) {
        try {
          const account = await withTimeout(this.#runtime.readAccount(), 5_000, "Codex 账户状态读取超时");
          if (isUnauthenticatedAccount(account)) phase = "unauthenticated";
        } catch (error) {
          if (isAuthenticationError(error)) phase = "unauthenticated";
          else throw error;
        }
      }
      this.#status = { ...this.#status, phase, error: null };
    } catch (error) {
      const message = safeErrorMessage(error);
      this.#diagnostics.record(`bootstrap: ${message}`);
      this.#status = { ...this.#status, phase: "degraded", error: message };
    }
    return this.status();
  }
}

function isUnauthenticatedAccount(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const record = value as Record<string, unknown>;
  if (record.account === null || record.account === undefined) return true;
  return false;
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /auth|login|sign[ -]?in|未登录|登录/iu.test(message);
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Z]:\\[^\s"']+/giu, "<path>")
    .replace(/\/[^\s"']+/g, "<path>")
    .replace(/(authorization|cookie|password|secret|token|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]")
    .slice(0, 512);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
