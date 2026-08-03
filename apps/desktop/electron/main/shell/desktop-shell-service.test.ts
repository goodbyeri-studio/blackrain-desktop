import { describe, expect, it, vi } from "vitest";
import { DesktopShellService } from "./desktop-shell-service";

describe("DesktopShellService", () => {
  it("只允许受支持的外部协议", async () => {
    const provider = {
      openExternal: vi.fn(async () => undefined),
      showItemInFolder: vi.fn(),
    };
    const service = new DesktopShellService(provider);

    await service.openExternal({ url: "https://example.com/path" });
    await service.openExternal({ url: "mailto:test@example.com" });

    expect(provider.openExternal).toHaveBeenNthCalledWith(
      1,
      "https://example.com/path",
    );
    expect(provider.openExternal).toHaveBeenNthCalledWith(
      2,
      "mailto:test@example.com",
    );
    await expect(service.openExternal({ url: "file:///C:/secret.txt" }))
      .rejects.toThrow("只允许 http、https 或 mailto 外部链接");
  });

  it("只向文件管理器传递规范化的绝对路径", () => {
    const provider = {
      openExternal: vi.fn(async () => undefined),
      showItemInFolder: vi.fn(),
    };
    const service = new DesktopShellService(provider);

    service.revealPath({ path: "C:\\workspace\\src\\..\\README.md" });

    expect(provider.showItemInFolder).toHaveBeenCalledWith(
      "C:\\workspace\\README.md",
    );
    expect(() => service.revealPath({ path: "README.md" })).toThrow(
      "只允许在文件管理器中显示绝对路径",
    );
  });
});
