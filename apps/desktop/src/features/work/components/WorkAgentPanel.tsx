import { useState } from "react";
import Bot from "lucide-react/dist/esm/icons/bot";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Brain from "lucide-react/dist/esm/icons/brain";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import Settings from "lucide-react/dist/esm/icons/settings";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import X from "lucide-react/dist/esm/icons/x";

import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type {
  ActivatedWorkbenchContext,
  HermesRuntimeModel,
  WorkEvent,
  WorkRuntimeStatus,
  WorkTask,
} from "../types";

type AgentPanelTab = "agent" | "agents" | "models" | "skills" | "tools" | "permissions" | "memory" | "session";
type WorkUsageEvent = Extract<WorkEvent, { type: "usageUpdated" }>;

type WorkAgentPanelProps = {
  activation: ActivatedWorkbenchContext | null;
  runtime: WorkRuntimeStatus | null;
  task: WorkTask | null;
  models: HermesRuntimeModel[];
  selectedModel: string | null;
  usage: WorkUsageEvent | null;
  onOpenSettings: () => void;
  onClose: () => void;
};

function pathName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

const tabs: Array<{ id: AgentPanelTab; label: string; icon: typeof Bot }> = [
  { id: "agent", label: "Agent", icon: Bot },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "models", label: "Models & Context", icon: Sparkles },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "tools", label: "Tools & MCP", icon: Boxes },
  { id: "permissions", label: "Permissions", icon: KeyRound },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "session", label: "Session", icon: SlidersHorizontal },
];

export function WorkAgentPanel({
  activation,
  runtime,
  task,
  models,
  selectedModel,
  usage,
  onOpenSettings,
  onClose,
}: WorkAgentPanelProps) {
  const [tab, setTab] = useState<AgentPanelTab>("agent");

  return (
    <ModalShell
      className="work-agent-modal"
      cardClassName="work-agent-card"
      ariaLabel="WORK Agent"
      onBackdropClick={onClose}
      onEscapeKeyDown={onClose}
    >
      <header className="work-agent-header">
        <div>
          <span className="work-agent-mark"><Bot aria-hidden /></span>
          <span>
            <strong>Hermes Agent</strong>
            <small>{activation?.workbenchId ?? "WORK runtime"}</small>
          </span>
        </div>
        <button type="button" className="ghost icon-button" onClick={onClose} aria-label="关闭 WORK Agent">
          <X aria-hidden />
        </button>
      </header>
      <div className="work-agent-layout">
        <nav className="work-agent-nav" aria-label="WORK Agent 设置">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? "is-active" : ""}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                <Icon aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="work-agent-content">
          {tab === "agent" ? (
            <>
              <div className="work-agent-section-heading">
                <Cpu aria-hidden />
                <div><h2>Agent runtime</h2><p>当前 WORK 执行环境</p></div>
              </div>
              <dl className="work-agent-kv">
                <div><dt>状态</dt><dd>{runtime?.state ?? "stopped"}</dd></div>
                <div><dt>版本</dt><dd>{runtime?.version ?? "-"}</dd></div>
                <div><dt>模型</dt><dd>{selectedModel ?? task?.model ?? "未选择"}</dd></div>
                <div><dt>本轮用量</dt><dd>{usage ? `${usage.totalTokens.toLocaleString()} tokens` : "暂无"}</dd></div>
                <div><dt>项目</dt><dd title={activation?.project.path}>{activation ? pathName(activation.project.path) : "-"}</dd></div>
              </dl>
              <div className="work-agent-notice">
                模型目录来自当前 Hermes runtime；上游未提供 context window 时只显示真实 token 用量，不推算百分比。
              </div>
            </>
          ) : null}

          {tab === "agents" ? (
            <>
              <div className="work-agent-section-heading">
                <Bot aria-hidden />
                <div><h2>Agents</h2><p>当前任务的 Subagent 运行状态</p></div>
              </div>
              <div className="work-agent-empty is-detailed">
                <strong>当前没有可显示的 Subagent 数据</strong>
                <span>锁定 Hermes `/v1/runs` 事件合同尚未提供稳定的 Agents tree。</span>
              </div>
            </>
          ) : null}

          {tab === "skills" ? (
            <>
              <div className="work-agent-section-heading">
                <Wrench aria-hidden />
                <div><h2>Skills</h2><p>当前 activation 提供的方法与上下文</p></div>
              </div>
              <div className="work-agent-items">
                {activation?.skillRoots.length ? activation.skillRoots.map((root) => (
                  <div key={root} title={root}><Wrench aria-hidden /><span><strong>{pathName(root)}</strong><small>{root}</small></span></div>
                )) : <div className="work-agent-empty">没有已激活的 Skills</div>}
              </div>
            </>
          ) : null}

          {tab === "models" ? (
            <>
              <div className="work-agent-section-heading">
                <Sparkles aria-hidden />
                <div><h2>Models & Context</h2><p>账号允许模型与当前任务用量</p></div>
              </div>
              <dl className="work-agent-kv">
                <div><dt>执行器</dt><dd>Hermes Agent</dd></div>
                <div><dt>当前模型</dt><dd>{selectedModel ?? task?.model ?? "未选择"}</dd></div>
                <div><dt>Context usage</dt><dd>{usage ? `输入 ${usage.inputTokens.toLocaleString()} / 输出 ${usage.outputTokens.toLocaleString()} / 总计 ${usage.totalTokens.toLocaleString()}` : "本任务暂无用量"}</dd></div>
                <div><dt>可见模型目录</dt><dd>{models.length} 个 runtime models</dd></div>
              </dl>
              <div className="work-agent-items">
                {models.length ? models.map((model) => (
                  <div key={model.id}><Sparkles aria-hidden /><span><strong>{model.id}</strong><small>{model.ownedBy}</small></span></div>
                )) : <div className="work-agent-empty">当前 runtime 没有返回模型</div>}
              </div>
            </>
          ) : null}

          {tab === "tools" ? (
            <>
              <div className="work-agent-section-heading">
                <Boxes aria-hidden />
                <div><h2>Tools & MCP</h2><p>由 BlackRain Core 验证并绑定</p></div>
              </div>
              <div className="work-agent-items">
                {activation && (activation.plugins.length || activation.mcpServers.length) ? (
                  <>
                    {activation.plugins.map((plugin) => (
                      <div key={`plugin:${plugin.id}`}><Boxes aria-hidden /><span><strong>{plugin.id}</strong><small>Plugin {plugin.version}</small></span></div>
                    ))}
                    {activation.mcpServers.map((server) => (
                      <div key={`mcp:${server.id}`}><Boxes aria-hidden /><span><strong>{server.id}</strong><small>MCP · {server.pluginId}</small></span></div>
                    ))}
                  </>
                ) : <div className="work-agent-empty">没有已激活的插件或 MCP</div>}
              </div>
            </>
          ) : null}

          {tab === "permissions" ? (
            <>
              <div className="work-agent-section-heading">
                <KeyRound aria-hidden />
                <div><h2>Permissions</h2><p>当前 activation 的受控访问范围</p></div>
              </div>
              <div className="work-agent-permissions">
                <section><h3>Files</h3>{activation?.permissions.files.map((item) => <code key={item.path}>{item.access} · {item.path}</code>)}</section>
                <section><h3>Network</h3>{activation?.permissions.networkDomains.length ? activation.permissions.networkDomains.map((domain) => <code key={domain}>{domain}</code>) : <span>无</span>}</section>
                <section><h3>Processes</h3>{activation?.permissions.processIds.length ? activation.permissions.processIds.map((id) => <code key={id}>{id}</code>) : <span>无</span>}</section>
              </div>
            </>
          ) : null}

          {tab === "memory" ? (
            <>
              <div className="work-agent-section-heading">
                <Brain aria-hidden />
                <div><h2>Memory</h2><p>工作台隔离的长期记忆状态</p></div>
              </div>
              <div className="work-agent-empty is-detailed">
                <strong>未启用跨任务 Memory</strong>
                <span>BlackRain 当前只恢复 TaskStore 中的任务消息和事件，不读取 Hermes Desktop SQLite，也不会让不同工作台共享记忆。</span>
              </div>
            </>
          ) : null}

          {tab === "session" ? (
            <>
              <div className="work-agent-section-heading">
                <SlidersHorizontal aria-hidden />
                <div><h2>Session</h2><p>当前任务的持久化与恢复边界</p></div>
              </div>
              <dl className="work-agent-kv">
                <div><dt>任务</dt><dd>{task?.taskId ?? "尚未创建"}</dd></div>
                <div><dt>Hermes session</dt><dd>{task?.hermesSessionId ?? "尚未绑定"}</dd></div>
                <div><dt>状态</dt><dd>{task?.status ?? "新任务"}</dd></div>
                <div><dt>保留策略</dt><dd>本地持久化，显式删除</dd></div>
              </dl>
              <div className="work-agent-notice">
                重命名、置顶和归档由 TaskStore 管理；分叉仍等待 BlackRain task lineage 合同。
              </div>
            </>
          ) : null}
        </section>
      </div>
      <footer className="work-agent-footer">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <Settings aria-hidden />
          BlackRain 设置
        </button>
      </footer>
    </ModalShell>
  );
}
