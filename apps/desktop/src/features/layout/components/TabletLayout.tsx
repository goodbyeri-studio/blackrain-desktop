import type { MouseEvent, ReactNode } from "react";
import { useI18n } from "@/i18n";
import { MainTopbar } from "../../app/components/MainTopbar";
import { ChatPane } from "./ChatPane";

type TabletLayoutProps = {
  tabletNavNode: ReactNode;
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  showHome: boolean;
  showWorkspace: boolean;
  sidebarNode: ReactNode;
  tabletTab: "projects" | "codex" | "git" | "log";
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  topbarLeftNode: ReactNode;
  topbarActionsNode?: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  debugPanelNode: ReactNode;
};

// 注:tablet 已移除 codex/git/log 竖轨(TabletNav)及 git/log 全屏视图,
// 工作区固定为聊天视图。git/log 后端能力保留,相关节点(tabletNavNode/
// gitDiffPanelNode/gitDiffViewerNode/debugPanelNode/tabletTab)仍由 AppLayout
// 传入但暂不消费,待接入新的前端入口后再使用。
export function TabletLayout({
  approvalToastsNode,
  updateToastNode,
  errorToastsNode,
  homeNode,
  showHome,
  showWorkspace,
  sidebarNode,
  onSidebarResizeStart,
  topbarLeftNode,
  topbarActionsNode,
  messagesNode,
  composerNode,
}: TabletLayoutProps) {
  const { tx } = useI18n();

  return (
    <>
      <div className="tablet-projects">{sidebarNode}</div>
      <div
        className="projects-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={tx("Resize projects")}
        onMouseDown={onSidebarResizeStart}
      />
      <section className="tablet-main">
        {approvalToastsNode}
        {updateToastNode}
        {errorToastsNode}
        {showHome && homeNode}
        {showWorkspace && (
          <>
            <MainTopbar
              leftNode={topbarLeftNode}
              actionsNode={topbarActionsNode}
              className="tablet-topbar"
            />
            <div className="content tablet-content">
              <ChatPane messagesNode={messagesNode} composerNode={composerNode} />
            </div>
          </>
        )}
      </section>
    </>
  );
}
