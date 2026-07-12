import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import type { WorkFollowUp } from "../types";

type WorkFollowUpQueueProps = {
  items: WorkFollowUp[];
  busy: boolean;
  editingId: string | null;
  onEdit: (item: WorkFollowUp) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
};

export function WorkFollowUpQueue({
  items,
  busy,
  editingId,
  onEdit,
  onCancel,
  onRetry,
}: WorkFollowUpQueueProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="work-follow-up-queue" aria-label="后续任务队列">
      <header>
        <strong>后续任务</strong>
        <span>{items.length} 项已持久化</span>
      </header>
      {items.map((item, index) => (
        <article
          key={item.followUpId}
          className={`work-follow-up-item${editingId === item.followUpId ? " is-editing" : ""}`}
        >
          <span className="work-follow-up-order">{index + 1}</span>
          <div>
            <strong>{item.prompt}</strong>
            <small>
              {item.status === "queued"
                ? "等待当前任务结束"
                : item.status === "starting"
                  ? "正在创建下一次运行"
                  : item.lastError?.message ?? "启动失败，等待处理"}
            </small>
          </div>
          <div className="work-follow-up-actions">
            {item.status === "starting" ? (
              <LoaderCircle className="is-spinning" aria-label="正在启动" />
            ) : (
              <>
                {item.status !== "failed" || item.lastError?.retryable !== false ? (
                  <button
                    type="button"
                    className="ghost icon-button"
                    disabled={busy}
                    onClick={() => onEdit(item)}
                    aria-label={`编辑后续任务 ${index + 1}`}
                  >
                    <Pencil aria-hidden />
                  </button>
                ) : null}
                {item.status === "failed" && item.lastError?.retryable !== false ? (
                  <button
                    type="button"
                    className="ghost icon-button"
                    disabled={busy}
                    onClick={() => onRetry(item.followUpId)}
                    aria-label={`重试后续任务 ${index + 1}`}
                  >
                    <RotateCcw aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost icon-button"
                  disabled={busy}
                  onClick={() => onCancel(item.followUpId)}
                  aria-label={`取消后续任务 ${index + 1}`}
                >
                  <Trash2 aria-hidden />
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
