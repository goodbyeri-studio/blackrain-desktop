// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { useWorkController } from "../hooks/useWorkController";
import { initialWorkState, type WorkState } from "../state/reducer";
import type {
  ActivatedWorkbenchContext,
  WorkEvent,
  WorkFollowUp,
  WorkRuntimeStatus,
  WorkTask,
  WorkbenchPackageInspection,
} from "../types";
import { buildVisibleWorkEvents, resolveProjectOutputPath } from "../state/selectors";
import { WorkSurface } from "./WorkSurface";
import { pickWorkProjectFiles } from "@/services/tauri";

vi.mock("@/services/tauri", () => ({
  pickWorkProjectFiles: vi.fn(),
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

const followUp: WorkFollowUp = {
  schemaVersion: 1,
  followUpId: "follow-up-1",
  taskId: "task-1",
  prompt: "生成管理层摘要",
  projectFileRefs: [],
  instructions: null,
  model: null,
  status: "queued",
  attemptId: null,
  createdAt: 3,
  updatedAt: 3,
  lastError: null,
};

const bundledOffice: WorkbenchPackageInspection = {
  packageRoot: "C:\\Program Files\\BlackRain\\workbenches\\office-agent",
  manifestPath:
    "C:\\Program Files\\BlackRain\\workbenches\\office-agent\\workbench.yaml",
  manifest: {
    schemaVersion: 1,
    id: "com.blackrain.office",
    name: "Office 办公工作台",
    version: "0.1.0",
    publisher: "blackrain-official",
    description: "批量办公文件生成、整理和校验。",
    license: "BlackRain-Commercial",
    target: {
      domains: ["office"],
      roles: ["office-generalist"],
      platforms: [{ os: "windows", arch: "x86_64" }],
      blackrain: ">=0.7.68",
    },
    engine: { preferred: "work", allowed: ["work"] },
    skills: [
      { path: "skills/generate-office-deliverable" },
      { path: "skills/fix-office-formatting" },
      { path: "skills/render-office-preview" },
    ],
    plugins: [],
    dependencies: [
      {
        id: "com.blackrain.office-cli",
        kind: "bundled",
        version: "1.0.117",
        source: "app-resource:office-cli/windows-x64/officecli.exe",
        checksum:
          "sha256:ff4a790637bcd4fdaf046727752e9e44207425d5ceafe36131516d37500d9ebd",
        license: "Apache-2.0",
        installScope: "app_managed",
        uninstall: "remove_if_unused",
      },
    ],
    permissions: {
      files: { mode: "user-selected-folders" },
      network: { domains: [] },
      processes: { spawn: ["com.blackrain.office-cli"] },
    },
    tasks: { source: "tasks/tasks.yaml" },
    validation: {
      health: "validation/health.yaml",
      smoke: "validation/smoke/basic.yaml",
    },
    uninstall: { preserveUserProjects: true },
  },
  skillRoots: [],
  taskSource: "tasks/tasks.yaml",
  healthSource: "validation/health.yaml",
  smokeSource: "validation/smoke/basic.yaml",
  installableOnWindowsX64: true,
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
    enqueueFollowUp: vi.fn().mockResolvedValue([]),
    editFollowUp: vi.fn().mockResolvedValue([]),
    cancelFollowUp: vi.fn().mockResolvedValue([]),
    retryFollowUp: vi.fn().mockResolvedValue([]),
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
    const workController = controller({ activations: [], bundledOffice });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(screen.getByText("Office 工作台尚未激活")).toBeTruthy();
    expect((screen.getByLabelText("Office 任务指令") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByLabelText("发送任务") as HTMLButtonElement).disabled).toBe(true);
    expect(workController.startTask).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Office 工作台安装计划").textContent).toContain(
      "3 个 Skills",
    );
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
        projectFileRefs: [],
      });
    });
  });

  it("adds only current-project file references to the structured task input", async () => {
    const inside = `${activation.project.path}\\reports\\quarterly.xlsx`;
    vi.mocked(pickWorkProjectFiles).mockResolvedValue([
      inside,
      "C:\\Users\\demo\\Other\\secret.xlsx",
    ]);
    const workController = controller();
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("添加项目文件引用"));
    await waitFor(() => expect(screen.getByText("quarterly.xlsx")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("当前已验证项目目录");
    fireEvent.change(screen.getByLabelText("Office 任务指令"), {
      target: { value: "检查这份表格" },
    });
    fireEvent.click(screen.getByLabelText("发送任务"));

    await waitFor(() => {
      expect(workController.startTask).toHaveBeenCalledWith({
        activationId: activation.activationId,
        prompt: "检查这份表格",
        projectFileRefs: [inside],
      });
    });
  });

  it("queues a durable follow-up while the current run is active", async () => {
    const runningTask = { ...task, status: "running" as const, activeRunId: "run-1" };
    const workController = controller({
      tasks: {
        "task-1": { task: runningTask, events: [], eventIds: {}, followUps: [] },
      },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Office 任务指令"), {
      target: { value: "当前任务结束后生成摘要" },
    });
    fireEvent.click(screen.getByLabelText("排队后续任务"));

    await waitFor(() => {
      expect(workController.enqueueFollowUp).toHaveBeenCalledWith({
        taskId: "task-1",
        prompt: "当前任务结束后生成摘要",
        projectFileRefs: [],
      });
    });
    expect(workController.continueTask).not.toHaveBeenCalled();
  });

  it("loads a persisted follow-up into the composer for edit and supports cancel", async () => {
    const runningTask = { ...task, status: "running" as const, activeRunId: "run-1" };
    const workController = controller({
      tasks: {
        "task-1": {
          task: runningTask,
          events: [],
          eventIds: {},
          followUps: [followUp],
        },
      },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("编辑后续任务 1"));
    expect((screen.getByLabelText("Office 任务指令") as HTMLTextAreaElement).value).toBe(
      followUp.prompt,
    );
    fireEvent.change(screen.getByLabelText("Office 任务指令"), {
      target: { value: "生成董事会摘要" },
    });
    fireEvent.click(screen.getByLabelText("排队后续任务"));
    await waitFor(() => {
      expect(workController.editFollowUp).toHaveBeenCalledWith({
        taskId: "task-1",
        followUpId: "follow-up-1",
        prompt: "生成董事会摘要",
        projectFileRefs: [],
      });
    });

    fireEvent.click(screen.getByLabelText("取消后续任务 1"));
    expect(workController.cancelFollowUp).toHaveBeenCalledWith(
      "task-1",
      "follow-up-1",
    );
  });

  it("offers retry for retryable failures but only cancel for deactivated workbenches", () => {
    const retryable = {
      ...followUp,
      status: "failed" as const,
      lastError: {
        kind: "upstreamModel" as const,
        code: "hermes_run_create_failed",
        message: "启动失败",
        retryable: true,
        httpStatus: 503,
        requestId: null,
        details: {},
      },
    };
    const deactivated = {
      ...followUp,
      followUpId: "follow-up-2",
      prompt: "保留但不可重试",
      status: "failed" as const,
      lastError: {
        kind: "cancelled" as const,
        code: "workbench_deactivated",
        message: "工作台已停用",
        retryable: false,
        httpStatus: null,
        requestId: null,
        details: {},
      },
    };
    const runningTask = { ...task, status: "running" as const, activeRunId: "run-1" };
    const workController = controller({
      tasks: {
        "task-1": {
          task: runningTask,
          events: [],
          eventIds: {},
          followUps: [retryable, deactivated],
        },
      },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("重试后续任务 1"));
    expect(workController.retryFollowUp).toHaveBeenCalledWith("task-1", "follow-up-1");
    expect(screen.queryByLabelText("重试后续任务 2")).toBeNull();
    expect(screen.queryByLabelText("编辑后续任务 2")).toBeNull();
    expect(screen.getByLabelText("取消后续任务 2")).toBeTruthy();
  });

  it("deletes only settled local task metadata after an explicit confirmation", async () => {
    const workController = controller({
      tasks: {
        "task-1": { task, events: [], eventIds: {}, followUps: [followUp] },
      },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });
    vi.mocked(workController.deleteTaskMetadata).mockResolvedValue(true);
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Office Project，已完成" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "删除记录" }));
    const dialog = screen.getByRole("dialog", { name: "删除本地任务记录？" });
    expect(dialog.textContent).toContain("不会删除项目目录");
    expect(dialog.textContent).toContain(task.projectPath);
    fireEvent.click(screen.getByRole("button", { name: "确认删除记录" }));

    await waitFor(() => {
      expect(workController.deleteTaskMetadata).toHaveBeenCalledWith(task.taskId);
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
      event({
        type: "userMessageAdded",
        text: "整理季度报告",
        projectFileRefs: [`${task.projectPath}\\reports\\quarterly.xlsx`],
        sourceFollowUpId: null,
      }),
      event({ type: "agentMessageCompleted", sequence: 2, text: "已完成整理。" }),
      event({ type: "outputAvailable", sequence: 3, path: `${task.projectPath}\\report.docx`, mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      event({ type: "approvalRequested", sequence: 4, command: "office-cli write report.docx", description: "写入报告", choices: ["once", "deny"] }),
    ];
    const workController = controller({
      tasks: { "task-1": { task: { ...task, status: "waitingForApproval", activeRunId: "run-1" }, events, eventIds: Object.fromEntries(events.map((entry) => [entry.eventId, true])), followUps: [] } },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });

    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(screen.getByText("已完成整理。")).toBeTruthy();
    expect(screen.getByText("quarterly.xlsx")).toBeTruthy();
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
