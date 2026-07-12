import { Component, type ErrorInfo, type ReactNode } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { PanelFrame } from "@/features/design-system/components/panel/PanelPrimitives";

type WorkSurfaceBoundaryProps = {
  children: ReactNode;
  onClose: () => void;
  onRetry?: () => void;
};

type WorkSurfaceBoundaryState = {
  failed: boolean;
};

export class WorkSurfaceBoundary extends Component<
  WorkSurfaceBoundaryProps,
  WorkSurfaceBoundaryState
> {
  state: WorkSurfaceBoundaryState = { failed: false };

  static getDerivedStateFromError(): WorkSurfaceBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // WORK render failures stay inside this boundary. Do not copy arbitrary
    // error text or component stacks into diagnostics because they may include
    // user-controlled task content.
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className="work-surface" data-testid="work-surface-failure-boundary">
        <header className="work-surface-header">
          <button
            type="button"
            className="ghost icon-button"
            onClick={this.props.onClose}
            aria-label="关闭 WORK 并返回 CODE"
          >
            <ArrowLeft aria-hidden />
          </button>
          <div className="work-surface-title">
            <strong>WORK surface</strong>
            <span>Hermes 界面故障已隔离</span>
          </div>
        </header>

        <div className="work-surface-failure-layout" role="alert">
          <PanelFrame className="work-surface-failure">
            <strong>WORK 界面暂时无法显示</strong>
            <p>
              Hermes 任务和 CODE surface 使用独立状态。你可以返回 CODE 继续工作，或尝试重新渲染 WORK。
            </p>
            <div className="work-surface-failure-actions">
              <button type="button" className="ghost" onClick={this.props.onClose}>
                返回 CODE
              </button>
              <button type="button" className="primary" onClick={this.retry}>
                <RefreshCw aria-hidden />
                重试 WORK
              </button>
            </div>
          </PanelFrame>
        </div>
      </div>
    );
  }
}
