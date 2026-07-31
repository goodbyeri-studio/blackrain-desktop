import { useEffect, useState } from "react";
import { fetchCreditSummary, type CreditSummary } from "../accountService";
import { formatCredits } from "../utils/creditDisplay";

export interface CreditUsageBarProps {
  userId: string;
  // 当前余额（profiles.credits），用于和派生总额校验展示。
  credits: number;
  // 离线时不拉流水，展示降级。
  online: boolean;
}

// 积分额度条：从 ledger 派生总额/已用，显示“已用 / 总额”。
export function CreditUsageBar({ userId, credits, online }: CreditUsageBarProps) {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!online) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const s = await fetchCreditSummary(userId);
        if (active) {
          setSummary(s);
          setError(false);
        }
      } catch {
        if (active) {
          setError(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, online]);

  if (!online) {
    return <div className="settings-help">余额暂不可用（离线）。</div>;
  }
  if (error) {
    return <div className="settings-help">额度信息加载失败。</div>;
  }
  if (!summary) {
    return <div className="settings-help">额度加载中…</div>;
  }

  // 总额以「累计获得」为准；已用取 ledger 消耗。占比按总额裁剪到 [0,100]。
  const total = summary.granted;
  const used = summary.used;
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;

  return (
    <div className="credit-usage-bar">
      <div className="credit-usage-bar-track">
        <div className="credit-usage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="credit-usage-bar-legend">
        <span>已用 {formatCredits(used)}</span>
        <span>剩余 {formatCredits(credits)} / 共 {formatCredits(total)}</span>
      </div>
    </div>
  );
}
