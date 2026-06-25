import { describe, expect, it } from "vitest";
import {
  formatMultiplier,
  hasKnownMultiplier,
  modelMultiplier,
} from "./creditPricing";

describe("creditPricing", () => {
  it("flash 0.5x / pro 1.5x，比值钉死 DeepSeek 真实价 3:1", () => {
    const flash = modelMultiplier("deepseek-v4-flash");
    const pro = modelMultiplier("deepseek-v4-pro");
    expect(flash.multiplier).toBe(0.5);
    expect(pro.multiplier).toBe(1.5);
    // 核心不变量：pro 是 flash 的 3 倍。
    expect(pro.multiplier / flash.multiplier).toBe(3);
  });

  it("未知模型回退 1x，不误加价", () => {
    const unknown = modelMultiplier("gpt-5.5");
    expect(unknown.multiplier).toBe(1);
    expect(hasKnownMultiplier("gpt-5.5")).toBe(false);
  });

  it("hasKnownMultiplier 只对自有模型为真", () => {
    expect(hasKnownMultiplier("deepseek-v4-flash")).toBe(true);
    expect(hasKnownMultiplier("deepseek-v4-pro")).toBe(true);
  });

  it("formatMultiplier 去除多余小数", () => {
    expect(formatMultiplier(0.5)).toBe("0.5x");
    expect(formatMultiplier(1.5)).toBe("1.5x");
    expect(formatMultiplier(1)).toBe("1x");
    expect(formatMultiplier(2.0)).toBe("2x");
  });

  it("modelMultiplier 返回带标签", () => {
    expect(modelMultiplier("deepseek-v4-flash").label).toBe("0.5x");
    expect(modelMultiplier("deepseek-v4-pro").label).toBe("1.5x");
  });
});
