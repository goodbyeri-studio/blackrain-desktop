// 002-accounts-credits / M-A1：账号领域类型。
// 与 Supabase profiles 表对齐（design.md「数据模型」）。

// 三档套餐。MVP 只实做 free；plus/pro 占位（价格/额度待定）。
export type AccountPlan = "free" | "plus" | "pro";

export const ACCOUNT_PLANS: AccountPlan[] = ["free", "plus", "pro"];

// profiles 表的一行（前端只读，写入走服务端 service-role）。
export interface AccountProfile {
  id: string;
  plan: AccountPlan;
  // credit 余额。占位赠送额 100 ≈ 1M pro-等效 token。可为负（并发超卖，下次充值补齐）。
  credits: number;
  createdAt: string | null;
}

// 鉴权会话的最小公开视图（不含敏感 token；token 只进钥匙串）。
export interface AccountSession {
  userId: string;
  email: string | null;
  // access token 过期的 Unix 秒。用于判断是否需要静默刷新。
  expiresAt: number | null;
}

// 鉴权状态机：未配置后端 → 加载中 → 未登录 / 已登录。
export type AccountStatus =
  | "unconfigured" // Supabase 未配置（缺 env），UI 走降级
  | "loading" // 正在恢复/校验会话
  | "signed-out"
  | "signed-in";

export interface AccountState {
  status: AccountStatus;
  session: AccountSession | null;
  profile: AccountProfile | null;
  error: string | null;
}

// 套餐展示元数据（设置页三档展示用；价格占位）。
export interface PlanDescriptor {
  plan: AccountPlan;
  label: string;
  // 占位文案，正式定价后回填。
  priceLabel: string;
  byok: boolean; // 是否允许自带 key（BYOK）——仅 plus+。
}

export const PLAN_DESCRIPTORS: Record<AccountPlan, PlanDescriptor> = {
  free: { plan: "free", label: "Free", priceLabel: "免费", byok: false },
  plus: { plan: "plus", label: "Plus", priceLabel: "价格待定", byok: true },
  pro: { plan: "pro", label: "Pro", priceLabel: "价格待定", byok: true },
};

// 是否允许 BYOK（自带第三方 key）。决策：仅 plus+。见 decisions.md「BYOK 锁 Plus」。
export function planAllowsByok(plan: AccountPlan): boolean {
  return PLAN_DESCRIPTORS[plan]?.byok ?? false;
}
