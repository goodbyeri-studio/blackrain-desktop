// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import {
  buildVisibleWorkEvents,
  resolveProjectOutputPath,
  resolveWorkMessageFilePath,
} from "../state/selectors";
import { WorkSurface } from "./WorkSurface";
import {
  pickWorkProjectFiles,
  pickWorkspacePath,
  revealPathInFileManager,
} from "@/services/tauri";

const dragDrop = vi.hoisted(() => ({
  listener: null as null | ((event: {
    payload: {
      type: "enter" | "over" | "leave" | "drop";
      position: { x: number; y: number };
      paths?: string[];
    };
  }) => void),
}));

vi.mock("@/services/tauri", () => ({
  pickWorkProjectFiles: vi.fn(),
  pickWorkspacePath: vi.fn(),
  revealPathInFileManager: vi.fn(),
}));

vi.mock("@/services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn((listener) => {
    dragDrop.listener = listener;
    return () => {
      dragDrop.listener = null;
    };
  }),
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
    refreshModels: vi.fn().mockResolvedValue([]),
    startRuntime: vi.fn().mockResolvedValue(runtime),
    stopRuntime: vi.fn(),
    restartRuntime: vi.fn(),
    repairRuntime: vi.fn(),
    loadDiagnostics: vi.fn(),
    refreshTasks: vi.fn(),
    refreshActivations: vi.fn(),
    activateOfficialWorkbench: vi.fn().mockResolvedValue({
      activation,
      installRoot: "C:\\Users\\demo\\AppData\\Roaming\\BlackRain\\workbenches\\com.blackrain.office\\versions\\0.1.0",
      officecliRoot: "C:\\Users\\demo\\AppData\\Roaming\\BlackRain\\tools\\officecli",
      healthChecks: ["OfficeCLI 1.0.117"],
      projectPreserved: true,
    }),
    deactivateActivation: vi.fn().mockResolvedValue({
      activationId: activation.activationId,
      stoppedTaskIds: [],
      projectPath: activation.project.path,
      projectPreserved: true,
    }),
    loadTask: vi.fn().mockResolvedValue(undefined),
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
    updateTaskMetadata: vi.fn().mockResolvedValue(task),
    listProjectDirectory: vi.fn(() => new Promise(() => undefined)),
    previewProjectFile: vi.fn(),
    refreshRecovery: vi.fn(),
    selectTask: vi.fn(),
    clearError: vi.fn(),
  } as ReturnType<typeof useWorkController>;
}

afterEach(() => {
  cleanup();
  dragDrop.listener = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("WorkSurface", () => {
  it("switches back to the CODE surface through the shared mode switch", () => {
    const onClose = vi.fn();
    render(<WorkSurface controller={controller() as never} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks formal task creation until a verified activation exists", () => {
    const workController = controller({ activations: [], bundledOffice });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "HERMES AGENT" })).toBeTruthy();
    expect((screen.getByLabelText("WORK 任务指令") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByLabelText("发送任务") as HTMLButtonElement).disabled).toBe(true);
    expect(workController.startTask).not.toHaveBeenCalled();
    expect(within(screen.getByRole("complementary")).getAllByRole("button", { name: "新建项目" })[0]).toBeTruthy();
  });

  it("requires project selection and explicit permission confirmation before activation", async () => {
    vi.mocked(pickWorkspacePath).mockResolvedValue("C:\\Users\\demo\\New Office Project");
    const workController = controller({ activations: [], bundledOffice });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("complementary")).getAllByRole("button", { name: "新建项目" })[0]);
    expect(await screen.findByText("安装并激活 Office 工作台？")).toBeTruthy();
    expect(screen.getByText(/New Office Project/).textContent).toContain("读写权限");

    fireEvent.click(screen.getByRole("button", { name: "确认权限并激活" }));
    await waitFor(() =>
      expect(workController.activateOfficialWorkbench).toHaveBeenCalledWith(
        "com.blackrain.office",
        "C:\\Users\\demo\\New Office Project",
      ),
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

    fireEvent.change(screen.getByLabelText("WORK 任务指令"), {
      target: { value: "整理季度报告" },
    });
    fireEvent.click(screen.getByLabelText("发送任务"));

    await waitFor(() => {
      expect(workController.startTask).toHaveBeenCalledWith({
        activationId: activation.activationId,
        prompt: "整理季度报告",
        projectFileRefs: [],
        model: null,
      });
    });
  });

  it("selects only models exposed by the current Hermes runtime", async () => {
    const workController = controller({
      models: [
        { id: "deepseek-v4", ownedBy: "blackrain" },
        { id: "glm-5", ownedBy: "blackrain" },
      ],
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("选择 WORK 模型"));
    fireEvent.click(screen.getByRole("option", { name: /glm-5/ }));
    fireEvent.change(screen.getByLabelText("WORK 任务指令"), {
      target: { value: "整理季度报告" },
    });
    fireEvent.click(screen.getByLabelText("发送任务"));

    await waitFor(() =>
      expect(workController.startTask).toHaveBeenCalledWith({
        activationId: activation.activationId,
        prompt: "整理季度报告",
        projectFileRefs: [],
        model: "glm-5",
      }),
    );
  });

  it("renames, pins and archives a settled task through persisted metadata actions", async () => {
    const workController = controller({
      tasks: {
        [task.taskId]: { task, events: [], eventIds: {}, followUps: [] },
      },
      taskOrder: [task.taskId],
      selectedTaskId: task.taskId,
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/任务操作/));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("任务名称"), {
      target: { value: "季度报告" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(workController.updateTaskMetadata).toHaveBeenCalledWith({
        taskId: "task-1",
        title: "季度报告",
      }),
    );

    fireEvent.click(screen.getByLabelText(/任务操作/));
    fireEvent.click(screen.getByRole("menuitem", { name: "置顶" }));
    expect(workController.updateTaskMetadata).toHaveBeenCalledWith({
      taskId: "task-1",
      pinned: true,
    });

    fireEvent.click(screen.getByLabelText(/任务操作/));
    fireEvent.click(screen.getByRole("menuitem", { name: "归档" }));
    expect(workController.updateTaskMetadata).toHaveBeenCalledWith({
      taskId: "task-1",
      archived: true,
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
    fireEvent.change(screen.getByLabelText("WORK 任务指令"), {
      target: { value: "检查这份表格" },
    });
    fireEvent.click(screen.getByLabelText("发送任务"));

    await waitFor(() => {
      expect(workController.startTask).toHaveBeenCalledWith({
        activationId: activation.activationId,
        prompt: "检查这份表格",
        projectFileRefs: [inside],
        model: null,
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

    fireEvent.change(screen.getByLabelText("WORK 任务指令"), {
      target: { value: "当前任务结束后生成摘要" },
    });
    fireEvent.click(screen.getByLabelText("排队后续任务"));

    await waitFor(() => {
      expect(workController.enqueueFollowUp).toHaveBeenCalledWith({
        taskId: "task-1",
        prompt: "当前任务结束后生成摘要",
        projectFileRefs: [],
        model: null,
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
    const composer = screen.getByLabelText("WORK 任务指令") as HTMLTextAreaElement;
    expect(composer.value).toBe(
      followUp.prompt,
    );
    expect(document.activeElement).toBe(composer);
    fireEvent.change(screen.getByLabelText("WORK 任务指令"), {
      target: { value: "生成董事会摘要" },
    });
    fireEvent.click(screen.getByLabelText("排队后续任务"));
    await waitFor(() => {
      expect(workController.editFollowUp).toHaveBeenCalledWith({
        taskId: "task-1",
        followUpId: "follow-up-1",
        prompt: "生成董事会摘要",
        projectFileRefs: [],
        model: null,
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
    expect(screen.getAllByText("quarterly.xlsx").length).toBeGreaterThan(0);
    expect(screen.getAllByText("report.docx").length).toBeGreaterThan(0);
    expect(screen.getByText("Hermes 请求执行操作")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "拒绝" }));
    expect(screen.getByRole("log").getAttribute("aria-relevant")).toBe("additions text");
    expect(screen.getByRole("navigation", { name: "WORK 任务列表" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "仅本次允许" }));
    expect(workController.approveTask).toHaveBeenCalledWith("task-1", "once");
  });

  it("focuses the composer for a new task", () => {
    const workController = controller({
      tasks: { "task-1": { task, events: [], eventIds: {}, followUps: [] } },
      taskOrder: ["task-1"],
      selectedTaskId: "task-1",
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("新建 WORK 任务"));

    expect(document.activeElement).toBe(screen.getByLabelText("WORK 任务指令"));
  });

  it("manages diagnostics focus and closes the panel with Escape", async () => {
    const workController = controller();
    vi.mocked(workController.loadDiagnostics).mockResolvedValue({
      status: runtime,
      configState: "valid",
      configSummary: null,
      recentLogs: [],
      recentRequests: [],
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "诊断" });

    trigger.focus();
    fireEvent.click(trigger);
    const close = await screen.findByRole("button", { name: "关闭诊断" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("关闭诊断")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("opens WORK commands and routes existing actions into the resource rail", () => {
    const state: WorkState = {
      ...initialWorkState,
      activations: [activation],
      runtime,
      tasks: {
        [task.taskId]: { task, events: [], eventIds: {}, followUps: [] },
      },
      taskOrder: [task.taskId],
      selectedTaskId: task.taskId,
      bootstrapping: false,
    };
    render(<WorkSurface controller={controller(state) as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "搜索任务和命令" }));
    expect(screen.getByRole("dialog", { name: "WORK 命令" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /打开 Skills 与工具/ }));
    expect(screen.queryByRole("dialog", { name: "WORK 命令" })).toBeNull();
    expect(screen.getByRole("tab", { name: "工具" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("collapses and restores the Hermes-style resource rail", () => {
    render(<WorkSurface controller={controller() as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "打开任务资源" }));
    fireEvent.click(screen.getByRole("button", { name: "收起任务资源" }));
    expect(screen.queryByRole("complementary", { name: "任务资源" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开任务资源" }));
    expect(screen.getByRole("complementary", { name: "任务资源" })).toBeTruthy();
  });

  it("keeps the resource rail closed by default in compact layouts", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<WorkSurface controller={controller() as never} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "任务资源" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "打开任务资源" })).toBeTruthy();
  });

  it("shows the current runtime and activation in the WORK Agent panel", () => {
    const usage = event({
      type: "usageUpdated",
      inputTokens: 1_200,
      outputTokens: 300,
      totalTokens: 1_500,
    });
    render(
      <WorkSurface
        controller={controller({
          models: [{ id: "deepseek-v4", ownedBy: "blackrain" }],
          tasks: {
            [task.taskId]: {
              task: { ...task, model: "deepseek-v4" },
              events: [usage],
              eventIds: { [usage.eventId]: true },
              followUps: [],
            },
          },
          taskOrder: [task.taskId],
          selectedTaskId: task.taskId,
        }) as never}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "技能与工具" }));
    const dialog = screen.getByRole("dialog", { name: "WORK Agent" });
    expect(within(dialog).getByText("0.18.2")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Models & Context" }));
    expect(within(dialog).getAllByText("deepseek-v4")).toHaveLength(2);
    expect(within(dialog).getByText(/输入 1,200 \/ 输出 300 \/ 总计 1,500/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Agents" }));
    expect(within(dialog).getByText("当前没有可显示的 Subagent 数据")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Skills" }));
    expect(within(dialog).getByText("skills")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Permissions" }));
    expect(within(dialog).getByText(/Office Project/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Memory" }));
    expect(within(dialog).getByText("未启用跨任务 Memory")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Session" }));
    expect(within(dialog).getByText("session-1")).toBeTruthy();
  });

  it("reuses BlackRain dictation and inserts one transcript into the WORK draft", async () => {
    const onToggleDictation = vi.fn();
    const onDictationTranscriptHandled = vi.fn();
    render(
      <WorkSurface
        controller={controller() as never}
        onClose={vi.fn()}
        dictationEnabled
        dictationTranscript={{ id: "dictation-1", text: "整理会议纪要" }}
        onToggleDictation={onToggleDictation}
        onDictationTranscriptHandled={onDictationTranscriptHandled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    expect(onToggleDictation).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect((screen.getByLabelText("WORK 任务指令") as HTMLTextAreaElement).value).toBe(
        "整理会议纪要",
      ),
    );
    expect(onDictationTranscriptHandled).toHaveBeenCalledWith("dictation-1");
    expect(onDictationTranscriptHandled).toHaveBeenCalledTimes(1);
  });

  it("opens the shared BlackRain settings instead of creating WORK settings state", () => {
    const onOpenSettings = vi.fn();
    render(
      <WorkSurface
        controller={controller() as never}
        onClose={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "技能与工具" }));
    fireEvent.click(screen.getByRole("button", { name: "BlackRain 设置" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "WORK Agent" })).toBeNull();
  });

  it("switches tasks through the keyboard session picker", async () => {
    const secondTask = {
      ...task,
      taskId: "task-2",
      projectPath: "C:\\Users\\demo\\Research Project",
      status: "running" as const,
    };
    const workController = controller({
      tasks: {
        [task.taskId]: { task, events: [], eventIds: {}, followUps: [] },
        [secondTask.taskId]: { task: secondTask, events: [], eventIds: {}, followUps: [] },
      },
      taskOrder: [task.taskId, secondTask.taskId],
      selectedTaskId: task.taskId,
    });
    render(<WorkSurface controller={workController} onClose={vi.fn()} />);

    fireEvent.keyDown(document, { key: "p", ctrlKey: true });
    const picker = screen.getByRole("dialog", { name: "切换 WORK 任务" });
    fireEvent.change(within(picker).getByLabelText("搜索 WORK 任务切换器"), {
      target: { value: "Research" },
    });
    fireEvent.keyDown(within(picker).getByLabelText("搜索 WORK 任务切换器"), {
      key: "Enter",
    });

    await waitFor(() => expect(workController.selectTask).toHaveBeenCalledWith("task-2"));
    expect(workController.loadTask).toHaveBeenCalledWith("task-2");
  });

  it("accepts dropped files only from the verified project root", () => {
    render(<WorkSurface controller={controller() as never} onClose={vi.fn()} />);
    const surface = document.querySelector(".work-surface") as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 900,
      height: 700,
      top: 0,
      right: 900,
      bottom: 700,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      dragDrop.listener?.({
        payload: {
          type: "drop",
          position: { x: 100, y: 100 },
          paths: [
            `${task.projectPath}\\reports\\quarterly.xlsx`,
            "C:\\Users\\demo\\Other\\secret.xlsx",
          ],
        },
      });
    });

    expect(screen.getByText("quarterly.xlsx")).toBeTruthy();
    expect(screen.queryByText("secret.xlsx")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("当前已验证项目目录");
  });

  it("completes activation Skills from the Hermes-style slash menu", () => {
    render(<WorkSurface controller={controller() as never} onClose={vi.fn()} />);
    const composer = screen.getByLabelText("WORK 任务指令") as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: "/sk" } });
    expect(screen.getByRole("option", { name: "/skills" })).toBeTruthy();
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(composer.value).toBe("/skills ");
  });

  it("routes Composer actions to the existing tools rail", () => {
    render(<WorkSurface controller={controller() as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "打开 Composer 操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Skills 与工具" }));
    expect(screen.getByRole("tab", { name: "工具" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("collects structured output events in the Artifacts rail", async () => {
    const output = event({
      type: "outputAvailable",
      path: "report.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const workController = controller({
      tasks: {
        [task.taskId]: {
          task,
          events: [output],
          eventIds: { [output.eventId]: true },
          followUps: [],
        },
      },
      taskOrder: [task.taskId],
      selectedTaskId: task.taskId,
    });
    workController.previewProjectFile = vi.fn().mockResolvedValue({
      relativePath: "report.docx",
      kind: "unsupported",
      mediaType: null,
      size: 2048,
      content: null,
      dataUrl: null,
    });
    render(
      <WorkSurface
        controller={workController as never}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开任务资源" }));
    fireEvent.click(screen.getByRole("tab", { name: "审阅" }));
    expect(screen.getByText("任务结果审阅")).toBeTruthy();
    expect(screen.getByText("审阅成果")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "成果" }));
    expect(screen.getByText("Artifacts")).toBeTruthy();
    expect(screen.getAllByText("report.docx").length).toBeGreaterThan(0);
    const resourceRail = screen.getByRole("complementary", { name: "任务资源" });
    fireEvent.click(within(resourceRail).getByRole("button", { name: /report.docx/ }));
    expect(screen.getByRole("tab", { name: "预览" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(await screen.findByText(/不在 WebView 中解析/)).toBeTruthy();
    expect(workController.previewProjectFile).toHaveBeenCalledWith("task-1", "report.docx");
  });

  it("browses the task project and previews text through the controlled Core contract", async () => {
    const workController = controller({
      tasks: {
        [task.taskId]: { task, events: [], eventIds: {}, followUps: [] },
      },
      taskOrder: [task.taskId],
      selectedTaskId: task.taskId,
    });
    workController.listProjectDirectory = vi.fn().mockResolvedValue([
      {
        name: "notes.md",
        relativePath: "notes.md",
        kind: "file",
        size: 12,
        modifiedAt: 1,
      },
    ]);
    workController.previewProjectFile = vi.fn().mockResolvedValue({
      relativePath: "notes.md",
      kind: "text",
      mediaType: "text/plain",
      size: 12,
      content: "季度摘要",
      dataUrl: null,
    });
    render(<WorkSurface controller={workController as never} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "打开任务资源" }));
    fireEvent.click(screen.getByRole("tab", { name: "文件" }));
    fireEvent.click(await screen.findByRole("button", { name: /notes.md/ }));
    expect(await screen.findByText("季度摘要")).toBeTruthy();
    expect(workController.listProjectDirectory).toHaveBeenCalledWith("task-1", "");
    expect(workController.previewProjectFile).toHaveBeenCalledWith("task-1", "notes.md");
  });

  it("opens Markdown file links only after resolving them inside the project", () => {
    const message = event({
      type: "agentMessageCompleted",
      text: "打开 [报告](/workspace/Office%20Project/reports/quarterly.xlsx)",
    });
    render(
      <WorkSurface
        controller={controller({
          tasks: {
            [task.taskId]: {
              task,
              events: [message],
              eventIds: { [message.eventId]: true },
              followUps: [],
            },
          },
          taskOrder: [task.taskId],
          selectedTaskId: task.taskId,
        }) as never}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "报告" }));
    expect(revealPathInFileManager).toHaveBeenCalledWith(
      `${task.projectPath}\\reports\\quarterly.xlsx`,
    );
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
    expect(
      resolveWorkMessageFilePath(
        task.projectPath,
        "/workspace/Office Project/reports/quarterly.xlsx",
      ),
    ).toBe(`${task.projectPath}\\reports\\quarterly.xlsx`);
    expect(
      resolveWorkMessageFilePath(task.projectPath, "/workspace/Other/secret.xlsx"),
    ).toBeNull();
  });
});
