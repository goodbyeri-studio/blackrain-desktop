import Activity from "lucide-react/dist/esm/icons/activity";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Wrench from "lucide-react/dist/esm/icons/wrench";

import type { WorkRuntimeStatus } from "../types";

type WorkRuntimeBannerProps = {
  runtime: WorkRuntimeStatus | null;
  busy: boolean;
  onStart: () => void;
  onRestart: () => void;
  onRepair: () => void;
  onDiagnostics: () => void;
};

const runtimeLabel: Record<WorkRuntimeStatus["state"], string> = {
  notInstalled: "Hermes runtime 尚未安装",
  stopped: "Hermes runtime 已停止",
  starting: "正在启动 Hermes runtime",
  ready: "Hermes runtime 已就绪",
  stopping: "正在停止 Hermes runtime",
  degraded: "Hermes 连接已降级",
  crashed: "Hermes runtime 已崩溃",
  repairRequired: "Hermes runtime 需要修复",
};

export function WorkRuntimeBanner({
  runtime,
  busy,
  onStart,
  onRestart,
  onRepair,
  onDiagnostics,
}: WorkRuntimeBannerProps) {
  const state = runtime?.state ?? "stopped";
  const needsRepair =
    runtime != null && (state === "repairRequired" || state === "notInstalled");
  const canStart = runtime != null && (state === "stopped" || state === "crashed");
  const canRestart = runtime != null && state === "degraded";

  return (
    <section className={`work-runtime-banner is-${state}`} aria-live="polite">
      <div className="work-runtime-summary">
        <Activity aria-hidden />
        <div>
          <strong>{runtime ? runtimeLabel[state] : "正在检查 Hermes runtime"}</strong>
          <span>
            {runtime?.lastError?.message ??
              (runtime?.version ? `Hermes ${runtime.version}` : "WORK 路径直连 Hermes /v1")}
          </span>
        </div>
      </div>
      <div className="work-runtime-actions">
        {canStart ? (
          <button type="button" className="secondary" disabled={busy} onClick={onStart}>
            启动
          </button>
        ) : null}
        {canRestart ? (
          <button type="button" className="secondary" disabled={busy} onClick={onRestart}>
            <RefreshCw aria-hidden />
            重新连接
          </button>
        ) : null}
        {needsRepair ? (
          <button type="button" className="secondary" disabled={busy} onClick={onRepair}>
            <Wrench aria-hidden />
            修复
          </button>
        ) : null}
        <button type="button" className="ghost" disabled={busy} onClick={onDiagnostics}>
          诊断
        </button>
      </div>
    </section>
  );
}
