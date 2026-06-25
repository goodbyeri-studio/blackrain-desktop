import { describe, expect, it } from "vitest";
import { formatCredits, isCreditsDepleted, planLabel } from "./creditDisplay";

describe("creditDisplay", () => {
  it("formatCredits 整数直显、千分位", () => {
    expect(formatCredits(100)).toBe("100");
    expect(formatCredits(1000)).toBe("1,000");
    expect(formatCredits(0)).toBe("0");
  });

  it("formatCredits 小数保留 1 位", () => {
    expect(formatCredits(99.96)).toBe("100");
    expect(formatCredits(12.34)).toBe("12.3");
  });

  it("formatCredits 负数（超卖）显式带号", () => {
    expect(formatCredits(-5)).toBe("-5");
  });

  it("formatCredits 非有限值回退占位", () => {
    expect(formatCredits(NaN)).toBe("—");
    expect(formatCredits(Infinity)).toBe("—");
  });

  it("planLabel 映射三档", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("plus")).toBe("Plus");
    expect(planLabel("pro")).toBe("Pro");
  });

  it("isCreditsDepleted ≤0 为真", () => {
    expect(isCreditsDepleted(0)).toBe(true);
    expect(isCreditsDepleted(-1)).toBe(true);
    expect(isCreditsDepleted(0.5)).toBe(false);
    expect(isCreditsDepleted(100)).toBe(false);
  });
});
