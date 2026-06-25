import { formatCredits, planLabel } from "../utils/creditDisplay";
import type { AccountProfile } from "../types";

export interface AccountBalanceBadgeProps {
  profile: AccountProfile | null;
  // profile 拉取失败时降级提示。
  degraded?: boolean;
  className?: string;
}

// 展示当前 plan + credit 余额。M-A1.6。
// profile 为空时：若 degraded 显示「余额暂不可用」，否则不渲染。
export function AccountBalanceBadge({
  profile,
  degraded = false,
  className,
}: AccountBalanceBadgeProps) {
  if (!profile) {
    if (degraded) {
      return (
        <span className={className} title="余额暂不可用">
          余额暂不可用
        </span>
      );
    }
    return null;
  }
  return (
    <span
      className={className}
      title={`套餐 ${planLabel(profile.plan)} · 余额 ${formatCredits(profile.credits)} credits`}
    >
      {planLabel(profile.plan)} · {formatCredits(profile.credits)} credits
    </span>
  );
}
