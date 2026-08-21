import { randomUUID } from "node:crypto";
import {
  BROWSER_DYNAMIC_TOOL_NAMESPACE,
  BrowserDynamicToolAdapter,
  type BrowserAgentBackend,
} from "../browser/browser-dynamic-tool-adapter";

const E2E_HARNESS_KEY = "__blackrainElectronE2e";

export type ElectronE2eHarness = {
  startBrowserTurn(threadId: string, turnId: string): void;
  callBrowserTool(input: {
    threadId: string;
    turnId: string;
    tool: string;
    arguments: unknown;
  }): Promise<unknown>;
  completeBrowserTurn(threadId: string, turnId: string): void;
  simulateSystemPowerCycle(): Promise<void>;
};

export function installElectronE2eHarness(
  browserBackend: BrowserAgentBackend,
  options: {
    enabled: boolean;
    packaged: boolean;
    simulateSystemPowerCycle?: () => Promise<void>;
  },
): () => void {
  if (!options.enabled || options.packaged) return () => undefined;

  const adapter = new BrowserDynamicToolAdapter(browserBackend);
  const harness: ElectronE2eHarness = {
    startBrowserTurn(threadId, turnId) {
      adapter.registerThread(threadId);
      adapter.handleNotification("turn/started", {
        threadId,
        turn: { id: turnId },
      });
    },
    callBrowserTool(input) {
      return adapter.handleServerRequest({
        id: randomUUID(),
        method: "item/tool/call",
        params: {
          threadId: input.threadId,
          turnId: input.turnId,
          callId: randomUUID(),
          namespace: BROWSER_DYNAMIC_TOOL_NAMESPACE,
          tool: input.tool,
          arguments: input.arguments,
        },
        signal: new AbortController().signal,
      });
    },
    completeBrowserTurn(threadId, turnId) {
      adapter.handleNotification("turn/completed", {
        threadId,
        turn: { id: turnId },
      });
    },
    async simulateSystemPowerCycle() {
      if (!options.simulateSystemPowerCycle) {
        throw new Error("Electron E2E 系统电源周期未安装");
      }
      await options.simulateSystemPowerCycle();
    },
  };

  Object.defineProperty(globalThis, E2E_HARNESS_KEY, {
    configurable: true,
    enumerable: false,
    value: harness,
    writable: false,
  });
  return () => {
    delete (globalThis as Record<string, unknown>)[E2E_HARNESS_KEY];
  };
}
