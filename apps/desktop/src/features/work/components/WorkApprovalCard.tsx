import { useEffect, useRef } from "react";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";

import type { WorkEvent } from "../types";

type ApprovalEvent = Extract<WorkEvent, { type: "approvalRequested" }>;

type WorkApprovalCardProps = {
  approval: ApprovalEvent;
  busy: boolean;
  onChoose: (choice: "once" | "session" | "always" | "deny") => void;
};

export function WorkApprovalCard({ approval, busy, onChoose }: WorkApprovalCardProps) {
  const denyButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusedApprovalIdRef = useRef<string | null>(null);
  const titleId = `work-approval-title-${approval.eventId}`;
  const descriptionId = `work-approval-description-${approval.eventId}`;

  useEffect(() => {
    if (!busy && focusedApprovalIdRef.current !== approval.eventId) {
      denyButtonRef.current?.focus();
      focusedApprovalIdRef.current = approval.eventId;
    }
  }, [approval.eventId, busy]);

  return (
    <section
      className="work-approval-card"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-live="assertive"
    >
      <div className="work-approval-heading">
        <ShieldAlert aria-hidden />
        <div>
          <strong id={titleId}>Hermes 请求执行操作</strong>
          <span id={descriptionId}>
            {approval.description ?? "请确认该工具操作是否符合你的预期。"}
          </span>
        </div>
      </div>
      {approval.command ? <code className="work-approval-command">{approval.command}</code> : null}
      <div className="work-approval-actions">
        <button
          ref={denyButtonRef}
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => onChoose("deny")}
        >
          拒绝
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => onChoose("once")}>
          仅本次允许
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => onChoose("session")}>
          本任务允许
        </button>
      </div>
    </section>
  );
}
