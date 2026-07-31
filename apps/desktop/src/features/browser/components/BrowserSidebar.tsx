import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import Bot from "lucide-react/dist/esm/icons/bot";
import Download from "lucide-react/dist/esm/icons/download";
import FileUp from "lucide-react/dist/esm/icons/file-up";
import Globe2 from "lucide-react/dist/esm/icons/globe-2";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import MousePointer2 from "lucide-react/dist/esm/icons/mouse-pointer-2";
import Pause from "lucide-react/dist/esm/icons/pause";
import Plus from "lucide-react/dist/esm/icons/plus";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import X from "lucide-react/dist/esm/icons/x";
import type { BootstrapInfo } from "../../../../electron/shared/ipc";
import {
  BROWSER_SIDEBAR_ROUTE_KEY,
  type BrowserControlInput,
  type BrowserRouteScope,
  type BrowserTabState,
} from "../../../../electron/shared/browser-tabs";
import { getOptionalHostClient } from "@/host/client";

type BrowserSidebarProps = {
  threadId: string | null;
};

let nextLayoutRevision = 1;
let layoutQueue = Promise.resolve();

function tabLabel(tab: BrowserTabState): string {
  if (tab.title.trim()) {
    return tab.title;
  }
  if (tab.url === "about:blank") {
    return "新标签页";
  }
  try {
    return new URL(tab.url).hostname || tab.url;
  } catch {
    return tab.url;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 0) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sensitiveActionLabel(
  category: NonNullable<BrowserTabState["sensitiveActionRequest"]>["category"],
): string {
  return {
    "keyboard-activation": "键盘激活",
    login: "登录",
    authorize: "授权",
    send: "发送",
    publish: "发布",
    purchase: "购买或支付",
    delete: "删除",
  }[category];
}

function controlStatusLabel(tab: BrowserTabState): string {
  if (tab.controlOwner === "agent") return "Agent 控制";
  if (tab.handoff && tab.deliverable) return "用户 · Agent 交付";
  if (tab.origin === "popup") return "用户 · 弹窗";
  if (tab.origin === "restored") return "用户 · 已恢复";
  if (tab.origin === "agent") return "用户 · Agent 创建";
  return "用户控制";
}

function replaceTab(tabs: BrowserTabState[], next: BrowserTabState) {
  const index = tabs.findIndex((tab) => tab.browserTabId === next.browserTabId);
  if (index < 0) {
    return [...tabs, next];
  }
  return tabs.map((tab) => (tab.browserTabId === next.browserTabId ? next : tab));
}

function queueLayout(update: Parameters<NonNullable<ReturnType<typeof getOptionalHostClient>>["browser"]["setLayout"]>[0]) {
  const host = getOptionalHostClient();
  if (!host) {
    return;
  }
  layoutQueue = layoutQueue
    .catch(() => undefined)
    .then(() => host.browser.setLayout(update))
    .then(() => undefined)
    .catch((error) => {
      console.error("Browser 布局同步失败", error);
    });
}

export function BrowserSidebar({ threadId }: BrowserSidebarProps) {
  const host = getOptionalHostClient();
  const scope = useMemo<BrowserRouteScope | null>(
    () => (threadId ? { threadId, routeKey: BROWSER_SIDEBAR_ROUTE_KEY } : null),
    [threadId],
  );
  const [open, setOpen] = useState(Boolean(threadId));
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null);
  const [tabs, setTabs] = useState<BrowserTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [dialogPrompt, setDialogPrompt] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const activeTab = tabs.find((tab) => tab.browserTabId === activeTabId) ?? null;

  useEffect(() => {
    if (!host) {
      return;
    }
    let cancelled = false;
    void host.app
      .getBootstrap()
      .then((value) => {
        if (!cancelled) {
          setBootstrap(value);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommandError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host]);

  useEffect(() => {
    if (!host || !scope) {
      setTabs([]);
      setActiveTabId(null);
      return;
    }
    let cancelled = false;
    setOpen(true);
    void host.browser
      .listTabs(scope)
      .then((nextTabs) => {
        if (cancelled) {
          return;
        }
        setTabs(nextTabs);
        setActiveTabId((current) =>
          current && nextTabs.some((tab) => tab.browserTabId === current)
            ? current
            : nextTabs[0]?.browserTabId ?? null,
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setCommandError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, scope]);

  useEffect(() => {
    if (!host || !scope) {
      return;
    }
    return host.browser.onTabsChanged((event) => {
      if (
        event.scope.threadId !== scope.threadId ||
        event.scope.routeKey !== scope.routeKey
      ) {
        return;
      }
      setTabs(event.tabs);
      setActiveTabId((current) =>
        current && event.tabs.some((tab) => tab.browserTabId === current)
          ? current
          : event.tabs[0]?.browserTabId ?? null,
      );
    });
  }, [host, scope]);

  useLayoutEffect(() => {
    setAddress(activeTab?.url === "about:blank" ? "" : activeTab?.url ?? "");
  }, [activeTab?.browserTabId, activeTab?.url]);

  useEffect(() => {
    setDialogPrompt(activeTab?.dialog?.defaultPrompt ?? "");
  }, [activeTab?.dialog?.requestId, activeTab?.dialog?.defaultPrompt]);

  useEffect(() => {
    if (!host || !scope || !bootstrap) {
      return;
    }
    let frame = 0;
    const sendLayout = (forceHidden = false) => {
      const viewport = viewportRef.current;
      const rect = viewport?.getBoundingClientRect();
      const occluded =
        forceHidden ||
        document.visibilityState !== "visible" ||
        document.querySelector(".ds-modal") !== null;
      const bounds = rect
        ? {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
          }
        : { x: 0, y: 0, width: 0, height: 0 };
      queueLayout({
        windowGeneration: bootstrap.windowGeneration,
        layoutRevision: nextLayoutRevision++,
        ...scope,
        activeTabId,
        views: tabs.map((tab) => ({
          browserTabId: tab.browserTabId,
          viewGeneration: tab.viewGeneration,
          bounds,
          visible:
            !forceHidden &&
            open &&
            !occluded &&
            tab.browserTabId === activeTabId &&
            !tab.crashed &&
            tab.error === null,
          occluded,
        })),
      });
    };
    const scheduleLayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sendLayout());
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleLayout);
    if (viewportRef.current) {
      resizeObserver?.observe(viewportRef.current);
    }
    const mutationObserver = new MutationObserver(scheduleLayout);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleLayout);
    document.addEventListener("visibilitychange", scheduleLayout);
    scheduleLayout();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleLayout);
      document.removeEventListener("visibilitychange", scheduleLayout);
      sendLayout(true);
    };
  }, [activeTabId, bootstrap, host, open, scope, tabs]);

  const createTab = useCallback(async () => {
    if (!host || !scope) {
      return;
    }
    setBusy(true);
    setCommandError(null);
    try {
      const tab = await host.browser.createTab(scope);
      setTabs((current) => replaceTab(current, tab));
      setActiveTabId(tab.browserTabId);
      setOpen(true);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [host, scope]);

  const navigate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!host || !scope || !activeTab || !address.trim()) {
        return;
      }
      setBusy(true);
      setCommandError(null);
      try {
        const tab = await host.browser.navigate({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          url: address,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [activeTab, address, host, scope],
  );

  const control = useCallback(
    async (action: BrowserControlInput["action"]) => {
      if (!host || !scope || !activeTab) {
        return;
      }
      setCommandError(null);
      try {
        const tab = await host.browser.control({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          action,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, host, scope],
  );

  const closeTab = useCallback(
    async (tab: BrowserTabState) => {
      if (!host || !scope) {
        return;
      }
      setCommandError(null);
      try {
        await host.browser.closeTab({
          ...scope,
          browserTabId: tab.browserTabId,
          viewGeneration: tab.viewGeneration,
        });
        setTabs((current) => current.filter((item) => item.browserTabId !== tab.browserTabId));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [host, scope],
  );

  const takeControl = useCallback(async () => {
    if (!host || !scope || !activeTab || activeTab.controlOwner !== "agent") {
      return;
    }
    setCommandError(null);
    try {
      const tab = await host.browser.takeControl({
        ...scope,
        browserTabId: activeTab.browserTabId,
        viewGeneration: activeTab.viewGeneration,
      });
      setTabs((current) => replaceTab(current, tab));
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    }
  }, [activeTab, host, scope]);

  const respondPermission = useCallback(
    async (allow: boolean) => {
      if (!host || !scope || !activeTab?.permissionRequest) return;
      setCommandError(null);
      try {
        const tab = await host.browser.respondPermission({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          requestId: activeTab.permissionRequest.requestId,
          allow,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, host, scope],
  );

  const resolveDownload = useCallback(
    async (action: "save" | "cancel") => {
      if (!host || !scope || !activeTab?.download) return;
      setCommandError(null);
      try {
        const tab = await host.browser.resolveDownload({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          requestId: activeTab.download.requestId,
          action,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, host, scope],
  );

  const respondDialog = useCallback(
    async (accept: boolean) => {
      if (!host || !scope || !activeTab?.dialog) return;
      setCommandError(null);
      try {
        const tab = await host.browser.respondDialog({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          requestId: activeTab.dialog.requestId,
          accept,
          ...(activeTab.dialog.type === "prompt"
            ? { promptText: dialogPrompt }
            : {}),
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, dialogPrompt, host, scope],
  );

  const respondSensitiveAction = useCallback(
    async (allow: boolean) => {
      if (!host || !scope || !activeTab?.sensitiveActionRequest) return;
      setCommandError(null);
      try {
        const tab = await host.browser.respondSensitiveAction({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          requestId: activeTab.sensitiveActionRequest.requestId,
          allow,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, host, scope],
  );

  const resolveFileChooser = useCallback(
    async (action: "choose" | "cancel") => {
      if (!host || !scope || !activeTab?.fileChooserRequest) return;
      setCommandError(null);
      try {
        const tab = await host.browser.resolveFileChooser({
          ...scope,
          browserTabId: activeTab.browserTabId,
          viewGeneration: activeTab.viewGeneration,
          requestId: activeTab.fileChooserRequest.requestId,
          action,
        });
        setTabs((current) => replaceTab(current, tab));
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeTab, host, scope],
  );

  if (!host) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="browser-sidebar-opener"
        aria-label="打开浏览器"
        title="打开浏览器"
        onClick={() => setOpen(true)}
      >
        <PanelRightOpen size={17} aria-hidden />
      </button>
    );
  }

  return (
    <aside className="browser-sidebar" aria-label="浏览器" data-testid="browser-sidebar">
      <header className="browser-sidebar-header">
        <div className="browser-sidebar-heading">
          <Globe2 size={15} aria-hidden />
          <span>浏览器</span>
        </div>
        <div className="browser-sidebar-header-actions">
          {activeTab ? (
            activeTab.controlOwner === "agent" ? (
              <button
                type="button"
                className="browser-control-status is-agent"
                aria-label="接管浏览器"
                title="接管浏览器"
                onClick={() => void takeControl()}
              >
                <Bot size={13} aria-hidden />
                <span>{controlStatusLabel(activeTab)}</span>
              </button>
            ) : (
              <span className="browser-control-status" aria-label="用户控制浏览器">
                <MousePointer2 size={13} aria-hidden />
                <span>{controlStatusLabel(activeTab)}</span>
              </span>
            )
          ) : null}
          <button
            type="button"
            className="browser-icon-button"
            aria-label="新建标签页"
            title="新建标签页"
            onClick={() => void createTab()}
            disabled={!scope || busy}
          >
            <Plus size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="browser-icon-button"
            aria-label="收起浏览器"
            title="收起浏览器"
            onClick={() => setOpen(false)}
          >
            <PanelRightClose size={16} aria-hidden />
          </button>
        </div>
      </header>

      {tabs.length > 0 ? (
        <div className="browser-tab-strip" role="tablist" aria-label="浏览器标签页">
          {tabs.map((tab) => (
            <div
              key={tab.browserTabId}
              className={`browser-tab${tab.browserTabId === activeTabId ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="browser-tab-select"
                role="tab"
                aria-selected={tab.browserTabId === activeTabId}
                title={tabLabel(tab)}
                onClick={() => setActiveTabId(tab.browserTabId)}
              >
                {tab.crashed ? (
                  <AlertTriangle size={13} aria-hidden />
                ) : tab.pageLifecycle === "suspended" ? (
                  <Pause size={13} aria-hidden />
                ) : (
                  <Globe2 size={13} aria-hidden />
                )}
                <span>{tabLabel(tab)}</span>
              </button>
              <button
                type="button"
                className="browser-tab-close"
                aria-label={`关闭 ${tabLabel(tab)}`}
                title="关闭标签页"
                onClick={() => void closeTab(tab)}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="browser-toolbar">
        <button
          type="button"
          className="browser-icon-button"
          aria-label="后退"
          title="后退"
          disabled={!activeTab?.canGoBack}
          onClick={() => void control("back")}
        >
          <ArrowLeft size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="browser-icon-button"
          aria-label="前进"
          title="前进"
          disabled={!activeTab?.canGoForward}
          onClick={() => void control("forward")}
        >
          <ArrowRight size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="browser-icon-button"
          aria-label={activeTab?.loading ? "停止加载" : "刷新"}
          title={activeTab?.loading ? "停止加载" : "刷新"}
          disabled={!activeTab}
          onClick={() => void control(activeTab?.loading ? "stop" : "reload")}
        >
          {activeTab?.loading ? <X size={15} aria-hidden /> : <RotateCw size={14} aria-hidden />}
        </button>
        <form className="browser-address-form" onSubmit={navigate}>
          <Globe2 size={13} aria-hidden />
          <input
            aria-label="浏览器地址"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={() => void takeControl()}
            placeholder="输入网址或 localhost 地址"
            disabled={!activeTab}
            spellCheck={false}
          />
        </form>
        {activeTab?.loading ? <span className="browser-loading-indicator" aria-label="正在加载" /> : null}
      </div>

      {commandError ? <div className="browser-command-error">{commandError}</div> : null}

      {activeTab?.debuggerStatus === "unavailable" ? (
        <div className="browser-command-error" role="alert">
          页面控制连接不可用，请重新加载此标签页。
        </div>
      ) : null}

      {activeTab?.dialog ? (
        <div className="browser-request-banner browser-dialog-banner" role="alertdialog" aria-label="页面对话框">
          <ShieldAlert size={16} aria-hidden />
          <div>
            <strong>{activeTab.dialog.origin}</strong>
            <span>{activeTab.dialog.message}</span>
            {activeTab.dialog.type === "prompt" ? (
              <input
                aria-label="页面对话框输入"
                value={dialogPrompt}
                onChange={(event) => setDialogPrompt(event.target.value)}
                maxLength={4096}
              />
            ) : null}
          </div>
          {activeTab.dialog.type !== "alert" ? (
            <button type="button" onClick={() => void respondDialog(false)}>取消</button>
          ) : null}
          <button type="button" className="is-primary" onClick={() => void respondDialog(true)}>
            {activeTab.dialog.type === "alert" ? "确定" : "继续"}
          </button>
        </div>
      ) : null}

      {activeTab?.permissionRequest ? (
        <div className="browser-request-banner" role="alert">
          <ShieldAlert size={16} aria-hidden />
          <div>
            <strong>{activeTab.permissionRequest.origin}</strong>
            <span>请求 {activeTab.permissionRequest.permission} 权限</span>
          </div>
          <button type="button" onClick={() => void respondPermission(false)}>拒绝</button>
          <button type="button" className="is-primary" onClick={() => void respondPermission(true)}>允许一次</button>
        </div>
      ) : null}

      {activeTab?.download ? (
        <div className="browser-request-banner" role="status">
          <Download size={16} aria-hidden />
          <div>
            <strong>{activeTab.download.filename}</strong>
            <span>
              {activeTab.download.status === "pending"
                ? formatBytes(activeTab.download.totalBytes)
                : activeTab.download.status === "in-progress"
                  ? `${formatBytes(activeTab.download.receivedBytes)} / ${formatBytes(activeTab.download.totalBytes)}`
                  : activeTab.download.status === "completed"
                    ? "下载完成"
                    : activeTab.download.error ?? "下载失败"}
            </span>
          </div>
          {activeTab.download.status === "pending" ? (
            <>
              <button type="button" onClick={() => void resolveDownload("cancel")}>取消</button>
              <button type="button" className="is-primary" onClick={() => void resolveDownload("save")}>保存</button>
            </>
          ) : activeTab.download.status !== "in-progress" ? (
            <button type="button" onClick={() => void resolveDownload("cancel")}>关闭</button>
          ) : null}
        </div>
      ) : null}

      {activeTab?.sensitiveActionRequest ? (
        <div
          className="browser-request-banner"
          role="alertdialog"
          aria-label="敏感网页动作确认"
        >
          <ShieldAlert size={16} aria-hidden />
          <div>
            <strong>{activeTab.sensitiveActionRequest.origin}</strong>
            <span>
              Agent 请求{ sensitiveActionLabel(activeTab.sensitiveActionRequest.category) }：
              {activeTab.sensitiveActionRequest.label}
            </span>
          </div>
          <button type="button" onClick={() => void respondSensitiveAction(false)}>
            拒绝
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void respondSensitiveAction(true)}
          >
            确认一次
          </button>
        </div>
      ) : null}

      {activeTab?.fileChooserRequest ? (
        <div className="browser-request-banner" role="alert">
          <FileUp size={16} aria-hidden />
          <div>
            <strong>{activeTab.fileChooserRequest.origin}</strong>
            <span>
              请求选择{activeTab.fileChooserRequest.mode === "selectMultiple" ? "多个" : "一个"}文件
            </span>
          </div>
          <button type="button" onClick={() => void resolveFileChooser("cancel")}>取消</button>
          <button type="button" className="is-primary" onClick={() => void resolveFileChooser("choose")}>
            选择文件
          </button>
        </div>
      ) : null}

      {activeTab && activeTab.consoleMessages.length > 0 ? (
        <details className="browser-console-log">
          <summary>页面日志（{activeTab.consoleMessages.length}）</summary>
          <div>
            {activeTab.consoleMessages.map((entry) => (
              <p key={entry.id} data-level={entry.level}>
                <span>{entry.level}</span>
                <code>{entry.message}</code>
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <div className="browser-page-area">
        {!scope ? (
          <div className="browser-empty-state">
            <Globe2 size={24} aria-hidden />
            <strong>先打开一个对话</strong>
            <span>浏览标签按对话隔离，并与该对话的 Agent 共用页面。</span>
          </div>
        ) : !activeTab ? (
          <div className="browser-empty-state">
            <Globe2 size={24} aria-hidden />
            <strong>还没有打开网页</strong>
            <button type="button" className="browser-new-tab-button" onClick={() => void createTab()}>
              <Plus size={14} aria-hidden />
              新建标签页
            </button>
          </div>
        ) : activeTab.crashed || activeTab.error ? (
          <div className="browser-empty-state is-error">
            <AlertTriangle size={25} aria-hidden />
            <strong>{activeTab.crashed ? "页面进程已崩溃" : "页面无法加载"}</strong>
            <span>{activeTab.error?.description ?? "可以重新加载当前页面。"}</span>
            <button type="button" className="browser-new-tab-button" onClick={() => void control("reload")}>
              <RotateCw size={14} aria-hidden />
              重新加载
            </button>
          </div>
        ) : (
          <div ref={viewportRef} className="browser-native-viewport" data-testid="browser-viewport" />
        )}
      </div>
    </aside>
  );
}
