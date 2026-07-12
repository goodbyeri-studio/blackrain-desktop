// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { useWorkController } from "../hooks/useWorkController";
import { initialWorkState, type WorkState } from "../state/reducer";
import type {
  ActivatedWorkbenchContext,
  WorkEvent,
  WorkRuntimeStatus,
  WorkTask,
} from "../types";
import { buildVisibleWorkEvents, resolveProjectOutputPath } from "../state/selectors";
import { WorkSurface } from "./WorkSurface";

vi.mock("@/services/tauri", () => ({
  revealPathInFileManager: vi.fn(),
}));

const runtime: WorkRuntimeStatus = {
  schemaVersion: 1,
  state: "ready",
  version: "0.18.2",
  pid: 42,
  baseUrl: "http://127.0.0.1:9000",
  startedAt: 1,
  lastError: null,
};

const task: WorkTask = {
  schemaVersion: 1,
  taskId: "task-1",
  activationId: "activation-office-demo",
  workbenchId: "office-agent",
  workbenchVersion: "0.1.0",
  projectPath: "C:\\Users\\demo\\Office Project",
  hermesSessionId: "session-1",
  activeRunId: null,
  status: "completed",
  lastEventSequence: 1,
  createdAt: 1,
  updatedAt: 2,
  recovery: {},
};

const activation: ActivatedWorkbenchContext = {
  schemaVersion: 1,
  activationId: "activation-office-demo",
  workbenchId: "com.blackrain.office",
  workbenchVersion: "0.1.0",
  engine: "work",
  project: { projectId: "project-1", path: task.projectPath },
  task: null,
  skillRoots: ["C:\\Users\\demo\\AppData\\Roaming\\BlackRain\\skills"],
  plugins: [],
  mcpServers: [],
  environmentRefs: [],
  permissions: {
    grantId: "grant-office-demo",
    files: [{ path: task.projectPath, access: "readWrite" }],
    networkDomains: [],
    processIds: [],
  },
  verifiedAt: 1,
};

function event(overrides: Partial<WorkEvent> & Pick<WorkEvent, "type">): WorkEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${Math.random()}`,
    sequence: 1,
    taskId: "task-1",
    runId: "run-1",
    timestamp: 1,
    itemId: "message-1",
    ...overrides,
  } as WorkEvent;
}

function controller(stateOverrides: Partial<WorkState> = {}) {
  const state: WorkState = {
    ...initialWorkState,
    activations: [activation],
    runtime,
    bootstrapping: false,
    ...stateOverrides,
  };
  return {
    state,
    refreshRuntime: vi.fn(),
    startRuntime: vi.fn().mockResolvedValue(runtime),
    stopRuntime: vi.fn(),
    restartRuntime: vi.fn(),
    repairRuntime: vi.fn(),
    loadDiagnostics: vi.fn(),
    refreshTasks: vi.fn(),
    refreshActivations: vi.fn(),
    deactivateActivation: vi.fn().mockResolvedValue({
      activationId: activation.activationId,
      stoppedTaskIds: [],
      projectPath: activation.project.path,
      projectPreserved: true,
    }),
    loadTask: vi.fn(),
    startTask: vi.fn().mockResolvedValue(task),
    continueTask: vi.fn().mockResolvedValue(task),
    resumeTask: vi.fn(),
    approveTask: vi.fn(),
    stopTask: vi.fn(),
    deleteTaskMetadata: vi.fn(),
    refreshRecovery: vi.fn(),
    selectTask: vi.fn(),
    clearError: vi.fn(),
  } as ReturnType<typeof useWorkController>;
}

afterEach(() => cleanup());

describe("WorkSurface", () => {
  it("blocks formal task creation until a verified activation exists", () => {
    const workController = controller({ activations: [] });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(screen.getByText("Office 工作台尚未激活")).toBeTruthy();
    expect((screen.getByLabelText("Office 任务指令") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByLabelText("发送任务") as HTMLButtonElement).disabled).toBe(true);
    expect(workController.startTask).not.toHaveBeenCalled();
  });

  it("starts a real Office task through the controller", async () => {
    const workController = controller();
    render(
      <WorkSurface
        controller={workController}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Office 任务指令"), {
      target: { value: "整理季度报告" },
    });
    fireEvent.click(screen.getByLabelText("发送任务"));

    await waitFor(() => {
      expect(workController.startTask).toHaveBeenCalledWith({
        activationId: activation.activationId,
        prompt: "整理季度报告",
      });
    });
  });

  it("deactivates through a design-system confirmation and states project retention", async () => {
    const workController = controller();
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    const dialog = screen.getByRole("dialog", { name: "停用 Office 工作台？" });
    expect(dialog).toBeTruthy();
    expect(
      within(dialog).getByText((_, element) =>
        Boolean(
          element?.classList.contains("ds-modal-subtitle") &&
            element.textContent?.includes(activation.project.path),
        ),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));

    await waitFor(() => {
      expect(workController.deactivateActivation).toHaveBeenCalledWith(
        activation.activationId,
      );
    });
  });

  it("renders persisted messages, output and pending approval", () => {
    const events: WorkEvent[] = [
      event({ type: "userMessageAdded", text: "整理季度报告" }),
      event({ type: "agentMessageCompleted", sequence: 2, text: "已完成整理。" }),
      event({ type: "outputAvailable", sequence: 3, path: `${task.projectPath}\\report.docx`, mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      event({ type: "approvalRequested", sequence: 4, command: "office-cli write report.docx", description: "写入报告", choices: ["once", "deny"] }),
    ];
    const workController = controller({
      tasks: { "task-1": { task: { ...task, status: "waitingForApproval", activeRunId: "run-1" }, events, eventIds: Object.fromEntries(events.map((entry) => [entry.eventId, true])) } },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });

    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(screen.getByText("已完成整理。")).toBeTruthy();
    expect(screen.getByText("report.docx")).toBeTruthy();
    expect(screen.getByText("Hermes 请求执行操作")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "仅本次允许" }));
    expect(workController.approveTask).toHaveBeenCalledWith("task-1", "once");
  });

  it("coalesces live deltas and hides them once the completed message arrives", () => {
    const first = event({ type: "agentTextDelta", eventId: "delta-1", sequence: 1, delta: "季度" });
    const second = event({ type: "agentTextDelta", eventId: "delta-2", sequence: 2, delta: "报告" });
    expect(buildVisibleWorkEvents([first, second])).toMatchObject([{ type: "agentTextDelta", delta: "季度报告" }]);

    const completed = event({ type: "agentMessageCompleted", eventId: "completed", sequence: 3, text: "季度报告" });
    expect(buildVisibleWorkEvents([first, second, completed])).toEqual([completed]);
  });

  it("only resolves output files inside the selected project", () => {
    expect(resolveProjectOutputPath(task.projectPath, "exports\\report.docx")).toBe(
      `${task.projectPath}\\exports\\report.docx`,
    );
    expect(resolveProjectOutputPath(task.projectPath, `${task.projectPath}\\report.docx`)).toBe(
      `${task.projectPath}\\report.docx`,
    );
    expect(resolveProjectOutputPath(task.projectPath, "..\\secret.txt")).toBeNull();
    expect(resolveProjectOutputPath(task.projectPath, "C:\\Users\\demo\\other\\secret.txt")).toBeNull();
  });
});
