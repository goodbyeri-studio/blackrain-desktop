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
import Globe2 from "lucide-react/dist/esm/icons/globe-2";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import Plus from "lucide-react/dist/esm/icons/plus";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";
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
                {tab.crashed ? <AlertTriangle size={13} aria-hidden /> : <Globe2 size={13} aria-hidden />}
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
            placeholder="输入网址或 localhost 地址"
            disabled={!activeTab}
            spellCheck={false}
          />
        </form>
        {activeTab?.loading ? <span className="browser-loading-indicator" aria-label="正在加载" /> : null}
      </div>

      {commandError ? <div className="browser-command-error">{commandError}</div> : null}

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
