import { describe, expect, it } from "vitest";
import { BrowserSensitiveActionPolicy } from "./browser-sensitive-action-policy";

describe("BrowserSensitiveActionPolicy", () => {
  const policy = new BrowserSensitiveActionPolicy();

  it.each([
    ["login", "Sign in"],
    ["authorize", "授权访问"],
    ["send", "Send message"],
    ["publish", "发布文章"],
    ["purchase", "Place order"],
    ["delete", "永久删除"],
  ] as const)("将 %s 动作分类为一次性确认", (category, name) => {
    expect(policy.evaluate({ role: "button", name })).toEqual({
      decision: "confirm",
      category,
    });
  });

  it("不根据普通页面文本或非交互节点授予或请求权限", () => {
    expect(policy.evaluate({ role: "heading", name: "Confirm purchase" })).toEqual({
      decision: "allow",
    });
    expect(policy.evaluate({ role: "button", name: "下一步" })).toEqual({
      decision: "allow",
    });
  });

  it("企业策略可以直接禁止动作类别", () => {
    const denied = new BrowserSensitiveActionPolicy({
      deniedCategories: ["purchase", "delete"],
    });
    expect(denied.evaluate({ role: "button", name: "Pay now" })).toEqual({
      decision: "deny",
      category: "purchase",
    });
  });

  it.each(["Enter", "NumpadEnter", " ", "Space"])(
    "将可能激活按钮或提交表单的 %s 按键分类为一次性确认",
    (key) => {
      expect(policy.evaluateKey(key)).toEqual({
        decision: "confirm",
        category: "keyboard-activation",
      });
    },
  );

  it("普通导航按键不触发敏感动作确认", () => {
    expect(policy.evaluateKey("Tab")).toEqual({ decision: "allow" });
    expect(policy.evaluateKey("ArrowDown")).toEqual({ decision: "allow" });
  });
});
