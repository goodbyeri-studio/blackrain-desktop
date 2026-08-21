import type { AppServerRpcErrorPayload } from "./rpc-types";

export type AppServerConnectionErrorCode =
  | "ABORTED"
  | "CLOSED"
  | "LIMIT_EXCEEDED"
  | "PROTOCOL_ERROR"
  | "TIMEOUT";

export class AppServerConnectionError extends Error {
  constructor(
    readonly code: AppServerConnectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppServerConnectionError";
  }
}

export class AppServerRpcError extends Error {
  constructor(readonly payload: AppServerRpcErrorPayload) {
    super(payload.message);
    this.name = "AppServerRpcError";
  }
}
