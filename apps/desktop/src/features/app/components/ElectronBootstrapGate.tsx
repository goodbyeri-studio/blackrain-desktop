import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { RuntimeBootstrapStatus } from "../../../../electron/shared/ipc";
import { getOptionalHostClient } from "@/host/client";

type ElectronBootstrapGateProps = {
  children: ReactNode;
};

export function ElectronBootstrapGate({ children }: ElectronBootstrapGateProps) {
  const host = getOptionalHostClient();
  const initialize = host?.app.initialize;
  const [status, setStatus] = useState<RuntimeBootstrapStatus | null>(null);
  const [continued, setContinued] = useState(false);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!host || !initialize) return;
    let active = true;
    void initialize().then(
      (next) => {
        if (active) setStatus(next);
      },
      () => {
        if (!active) return;
        setStatus({
          phase: "degraded",
          attempt: 1,
          codexHomeId: "0000000000000000",
          error: "Electron runtime 初始化失败",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [host, initialize]);

  const retry = useCallback(async () => {
    if (!host?.app.retry) return;
    setExportedPath(null);
    setStatus((current) => current ? { ...current, phase: "initializing", error: null } : current);
    setStatus(await host.app.retry());
  }, [host]);

  const exportDiagnostics = useCallback(async () => {
    if (!host?.app.exportDiagnostics) return;
    const path = await host.app.exportDiagnostics();
    if (path) setExportedPath(path);
  }, [host]);

  if (!host || !initialize || status?.phase === "ready" || continued) {
    return <>{children}</>;
  }

  const initializing = status === null || status.phase === "idle" || status.phase === "initializing";
  const unauthenticated = status?.phase === "unauthenticated";

  return (
    <>
      {children}
      <aside className="runtime-bootstrap runtime-bootstrap--overlay" aria-live="polite">
      <section className="runtime-bootstrap-card">
        <div className="runtime-bootstrap-brand">BlackRain</div>
        <h1>{initializing ? "正在启动 Electron runtime" : unauthenticated ? "Codex 尚未登录" : "Electron runtime 暂时不可用"}</h1>
        <p>
          {initializing
            ? "正在连接随应用提供的 Codex app-server。窗口会保持可见。"
            : unauthenticated
              ? "应用已使用标准 Codex Home 启动。你可以进入应用完成 Codex 登录。"
              : status?.error ?? "启动失败，可重试或导出诊断。"}
        </p>
        {!initializing ? (
          <div className="runtime-bootstrap-actions">
            {unauthenticated ? (
              <button type="button" className="primary" onClick={() => setContinued(true)}>
                进入应用
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => void retry()}>
                重试
              </button>
            )}
            <button type="button" onClick={() => void exportDiagnostics()}>
              导出诊断
            </button>
          </div>
        ) : (
          <div className="runtime-bootstrap-spinner" aria-hidden />
        )}
        {exportedPath ? <p className="runtime-bootstrap-exported">诊断已保存：{exportedPath}</p> : null}
        {status ? <small>Home {status.codexHomeId.slice(0, 8)} · 尝试 {status.attempt}</small> : null}
      </section>
      </aside>
    </>
  );
}
