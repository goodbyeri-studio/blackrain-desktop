// 002-accounts-credits / M-A1.6：credit 余额展示格式化。
// 纯函数，可单测。余额可为负（并发超卖，下次充值补齐）。

import { PLAN_DESCRIPTORS, type AccountPlan } from "../types";

// 格式化 credit 余额：整数直显，小数保留 1 位；负数显式带号。
export function formatCredits(credits: number): string {
  if (!Number.isFinite(credits)) {
    return "—";
  }
  const rounded = Number.isInteger(credits)
    ? credits
    : Number(credits.toFixed(1));
  return rounded.toLocaleString("zh-CN");
}

// 套餐展示标签。
export function planLabel(plan: AccountPlan): string {
  return PLAN_DESCRIPTORS[plan]?.label ?? plan;
}

// 余额是否耗尽（≤0）。门禁与提示用。
export function isCreditsDepleted(credits: number): boolean {
  return Number.isFinite(credits) && credits <= 0;
}
