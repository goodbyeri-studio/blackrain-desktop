import type {
  BrowserSensitiveActionCategory,
} from "../../shared/browser-tabs";
import type { BrowserLocatorResult } from "./browser-cdp-controller";

export type BrowserSensitiveActionDecision =
  | { decision: "allow" }
  | { decision: "confirm"; category: BrowserSensitiveActionCategory }
  | { decision: "deny"; category: BrowserSensitiveActionCategory };

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
]);

const CATEGORY_PATTERNS: ReadonlyArray<
  readonly [BrowserSensitiveActionCategory, RegExp]
> = [
  ["delete", /\b(?:delete|remove|destroy|erase|terminate account)\b|删除|移除|永久删除|注销账户/iu],
  ["purchase", /\b(?:buy|purchase|pay|checkout|place order|subscribe)\b|购买|支付|结账|下单|订阅/iu],
  ["publish", /\b(?:publish|post|deploy|go live)\b|发布|发表|上线/iu],
  ["send", /\b(?:send|submit|transfer|confirm transfer)\b|发送|提交|转账|汇款/iu],
  ["authorize", /\b(?:authorize|authorise|grant access|allow access|connect account|consent)\b|授权|允许访问|同意授权/iu],
  ["login", /\b(?:log[ -]?in|sign[ -]?in)\b|登录|登陆|登入/iu],
];

const KEYBOARD_ACTIVATION_KEYS = new Set([
  " ",
  "enter",
  "numpadenter",
  "space",
  "spacebar",
]);

export class BrowserSensitiveActionPolicy {
  readonly #deniedCategories: ReadonlySet<BrowserSensitiveActionCategory>;

  constructor(options: { deniedCategories?: readonly BrowserSensitiveActionCategory[] } = {}) {
    this.#deniedCategories = new Set(options.deniedCategories ?? []);
  }

  evaluate(locator: Pick<BrowserLocatorResult, "role" | "name">): BrowserSensitiveActionDecision {
    if (!INTERACTIVE_ROLES.has(locator.role.trim().toLocaleLowerCase())) {
      return { decision: "allow" };
    }
    const label = locator.name.normalize("NFKC").trim();
    const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0];
    if (!category) return { decision: "allow" };
    return this.#deniedCategories.has(category)
      ? { decision: "deny", category }
      : { decision: "confirm", category };
  }

  evaluateKey(key: string): BrowserSensitiveActionDecision {
    if (!KEYBOARD_ACTIVATION_KEYS.has(key.toLocaleLowerCase())) {
      return { decision: "allow" };
    }
    const category = "keyboard-activation" as const;
    return this.#deniedCategories.has(category)
      ? { decision: "deny", category }
      : { decision: "confirm", category };
  }
}
