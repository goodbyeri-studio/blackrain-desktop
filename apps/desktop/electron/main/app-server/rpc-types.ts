export type AppServerRpcId = number | string;

export type AppServerRpcErrorPayload = {
  code: number;
  message: string;
  data?: unknown;
};

export type AppServerServerRequest = {
  id: AppServerRpcId;
  method: string;
  params: unknown;
  signal: AbortSignal;
};

export type AppServerRequestHandler = (
  request: AppServerServerRequest,
) => unknown | Promise<unknown>;

export type AppServerNotificationHandler = (
  method: string,
  params: unknown,
) => void;

export type AppServerDiagnosticHandler = (line: string) => void;

export type AppServerProtocolErrorHandler = (error: Error) => void;

export type AppServerRpcConnectionOptions = {
  requestTimeoutMs?: number;
  serverRequestTimeoutMs?: number;
  maxLineBytes?: number;
  maxPendingRequests?: number;
  maxQueuedWrites?: number;
  maxConcurrentServerRequests?: number;
  onServerRequest?: AppServerRequestHandler;
  onNotification?: AppServerNotificationHandler;
  onDiagnostic?: AppServerDiagnosticHandler;
  onProtocolError?: AppServerProtocolErrorHandler;
};

export type AppServerRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};
