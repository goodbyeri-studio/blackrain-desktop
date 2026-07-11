export const WORK_SCHEMA_VERSION = 1 as const;

export type WorkTaskStatus =
  | "draft"
  | "queued"
  | "running"
  | "waitingForApproval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "degraded"
  | "orphaned";

export type WorkRuntimeState =
  | "notInstalled"
  | "stopped"
  | "starting"
  | "ready"
  | "stopping"
  | "degraded"
  | "crashed"
  | "repairRequired";

export type WorkErrorKind =
  | "connection"
  | "authentication"
  | "capabilityMissing"
  | "invalidRequest"
  | "upstreamModel"
  | "tool"
  | "timeout"
  | "cancelled"
  | "runtime"
  | "persistence"
  | "unsupported"
  | "unknown";

export type WorkError = {
  kind: WorkErrorKind;
  code: string;
  message: string;
  retryable: boolean;
  httpStatus: number | null;
  requestId: string | null;
  details: Record<string, unknown>;
};

export type WorkRuntimeStatus = {
  schemaVersion: typeof WORK_SCHEMA_VERSION;
  state: WorkRuntimeState;
  version: string | null;
  pid: number | null;
  baseUrl: string | null;
  startedAt: number | null;
  lastError: WorkError | null;
};

export type WorkTask = {
  schemaVersion: typeof WORK_SCHEMA_VERSION;
  taskId: string;
  workbenchId: string;
  workbenchVersion: string;
  projectPath: string;
  hermesSessionId: string | null;
  activeRunId: string | null;
  status: WorkTaskStatus;
  lastEventSequence: number;
  createdAt: number;
  updatedAt: number;
  recovery: Record<string, unknown>;
};

export type WorkRecoveryDisposition =
  | "resumable"
  | "completed"
  | "failed"
  | "cancelled"
  | "orphaned"
  | "unchanged";

export type WorkRecoveryRecord = {
  taskId: string;
  disposition: WorkRecoveryDisposition;
  lastEventSequence: number;
};

export type HermesTaskRecoveryState = {
  records: WorkRecoveryRecord[];
  error: WorkError | null;
};

export type HermesTaskStartInput = {
  workbenchId: string;
  workbenchVersion: string;
  projectPath: string;
  prompt: string;
  instructions?: string | null;
  model?: string | null;
};

export type HermesTaskReadResult = {
  task: WorkTask;
  events: WorkEvent[];
};

export type HermesHttpTrace = {
  requestId: string;
  method: string;
  path: string;
  status: number | null;
  outcome: string;
  elapsedMs: number;
};

export type HermesRuntimeDiagnostics = {
  status: WorkRuntimeStatus;
  configState: string;
  configSummary: Record<string, unknown> | null;
  recentLogs: string[];
  recentRequests: HermesHttpTrace[];
};

type WorkEventBase = {
  schemaVersion: typeof WORK_SCHEMA_VERSION;
  eventId: string;
  sequence: number;
  taskId: string;
  runId: string;
  timestamp: number;
  itemId: string | null;
};

export type WorkEvent = WorkEventBase &
  (
    | { type: "taskStatusChanged"; status: WorkTaskStatus }
    | { type: "userMessageAdded"; text: string }
    | { type: "agentTextDelta"; delta: string }
    | { type: "agentMessageCompleted"; text: string }
    | { type: "reasoningUpdated"; text: string }
    | { type: "toolStarted"; tool: string; preview: string | null }
    | { type: "toolProgress"; tool: string; text: string }
    | { type: "toolCompleted"; tool: string; duration: number | null; error: boolean }
    | {
        type: "approvalRequested";
        command: string | null;
        description: string | null;
        choices: string[];
      }
    | { type: "approvalResolved"; choice: string; resolved: number }
    | { type: "userInputRequested"; prompt: string; choices: string[] }
    | { type: "outputAvailable"; path: string; mediaType: string | null }
    | { type: "warningRaised"; message: string }
    | { type: "taskFailed"; error: WorkError }
    | { type: "unknown"; rawEventType: string }
  );

export type HermesRawEvent = {
  event: string;
  run_id: string;
  timestamp: number;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown) =>
  typeof value === "string" || value === null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const workTaskStatuses = new Set<WorkTaskStatus>([
  "draft",
  "queued",
  "running",
  "waitingForApproval",
  "stopping",
  "completed",
  "failed",
  "cancelled",
  "degraded",
  "orphaned",
]);

const workErrorKinds = new Set<WorkErrorKind>([
  "connection",
  "authentication",
  "capabilityMissing",
  "invalidRequest",
  "upstreamModel",
  "tool",
  "timeout",
  "cancelled",
  "runtime",
  "persistence",
  "unsupported",
  "unknown",
]);

const isWorkError = (value: unknown): value is WorkError => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.kind === "string" &&
    workErrorKinds.has(value.kind as WorkErrorKind) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    (typeof value.httpStatus === "number" || value.httpStatus === null) &&
    isNullableString(value.requestId) &&
    isRecord(value.details)
  );
};

export function isHermesRawEvent(value: unknown): value is HermesRawEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.event === "string" &&
    typeof value.run_id === "string" &&
    typeof value.timestamp === "number"
  );
}

export function isWorkEvent(value: unknown): value is WorkEvent {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.schemaVersion !== WORK_SCHEMA_VERSION ||
    typeof value.eventId !== "string" ||
    typeof value.sequence !== "number" ||
    typeof value.taskId !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.timestamp !== "number" ||
    !(typeof value.itemId === "string" || value.itemId === null) ||
    typeof value.type !== "string"
  ) {
    return false;
  }

  switch (value.type) {
    case "taskStatusChanged":
      return (
        typeof value.status === "string" &&
        workTaskStatuses.has(value.status as WorkTaskStatus)
      );
    case "agentTextDelta":
      return typeof value.delta === "string";
    case "userMessageAdded":
    case "agentMessageCompleted":
    case "reasoningUpdated":
      return typeof value.text === "string";
    case "unknown":
      return typeof value.rawEventType === "string";
    case "toolStarted":
      return typeof value.tool === "string" && isNullableString(value.preview);
    case "toolProgress":
      return typeof value.tool === "string" && typeof value.text === "string";
    case "toolCompleted":
      return (
        typeof value.tool === "string" &&
        (typeof value.duration === "number" || value.duration === null) &&
        typeof value.error === "boolean"
      );
    case "approvalRequested":
      return (
        isNullableString(value.command) &&
        isNullableString(value.description) &&
        isStringArray(value.choices)
      );
    case "approvalResolved":
      return typeof value.choice === "string" && typeof value.resolved === "number";
    case "userInputRequested":
      return typeof value.prompt === "string" && isStringArray(value.choices);
    case "outputAvailable":
      return typeof value.path === "string" && isNullableString(value.mediaType);
    case "warningRaised":
      return typeof value.message === "string";
    case "taskFailed":
      return isWorkError(value.error);
    default:
      return false;
  }
}
