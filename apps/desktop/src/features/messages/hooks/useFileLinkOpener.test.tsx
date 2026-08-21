// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revealPath } from "../../../host/desktop";
import { fileTarget } from "../test/fileLinkAssertions";
import { useFileLinkOpener } from "./useFileLinkOpener";

const showContextMenuMock = vi.hoisted(() =>
  vi.fn(async (_event: unknown, _entries: Array<{ label?: string; onSelect?: () => Promise<void> }>) => undefined),
);

vi.mock("../../../host/desktop", () => ({
  revealPath: vi.fn(),
}));

vi.mock("../../../host/contextMenu", () => ({
  showContextMenu: showContextMenuMock,
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("useFileLinkOpener", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function copyLinkFor(rawPath: string) {
    const clipboardWriteTextMock = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteTextMock },
      configurable: true,
    });
    const { result } = renderHook(() => useFileLinkOpener(null, [], ""));

    await act(async () => {
      await result.current.showFileLinkMenu(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 12,
          clientY: 24,
        } as never,
        fileTarget(rawPath),
      );
    });

    const items = showContextMenuMock.mock.calls[0]?.[1] ?? [];
    const copyLinkItem = items.find(
      (item: { label?: string; onSelect?: () => Promise<void> }) => item.label === "Copy Link",
    );

    await copyLinkItem?.onSelect?.();
    return clipboardWriteTextMock.mock.calls[0]?.[0];
  }

  it("copies namespace-prefixed Windows drive paths as round-trippable file URLs", async () => {
    expect(await copyLinkFor("\\\\?\\C:\\repo\\src\\App.tsx:42")).toBe(
      "file:///%5C%5C%3F%5CC%3A%5Crepo%5Csrc%5CApp.tsx#L42",
    );
  });

  it("copies namespace-prefixed Windows UNC paths as round-trippable file URLs", async () => {
    expect(await copyLinkFor("\\\\?\\UNC\\server\\share\\repo\\App.tsx:42")).toBe(
      "file:///%5C%5C%3F%5CUNC%5Cserver%5Cshare%5Crepo%5CApp.tsx#L42",
    );
  });

  it("percent-encodes copied file URLs for Windows paths with reserved characters", async () => {
    expect(await copyLinkFor("C:\\repo\\My File #100%.tsx:42")).toBe(
      "file:///C:/repo/My%20File%20%23100%25.tsx#L42",
    );
  });

  it("maps /workspace root-relative paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx"),
      );
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
    );
  });

  it("maps /workspace/<workspace-name>/... paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/CodexMonitor/LICENSE"));
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/LICENSE",
    );
  });

  it("maps extensionless files under /workspace/settings to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/settings";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/settings/LICENSE"));
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/settings/LICENSE",
    );
  });

  it("maps nested /workspaces/.../<workspace-name>/... paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspaces/team/CodexMonitor/src"));
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src",
    );
  });

  it("preserves file link line and column metadata for editor opens", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx:33:7"),
      );
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
    );
  });

  it("parses #L line anchors before opening the editor", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/src/App.tsx#L33"));
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/App.tsx",
    );
  });

  it("opens structured file targets without re-parsing #L-like filename endings", async () => {
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(null, [], ""));

    await act(async () => {
      await result.current.openFileLink({
        path: "/tmp/#L12",
        line: null,
        column: null,
      });
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/tmp/#L12",
    );
  });

  it("normalizes line ranges to the starting line before opening the editor", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const revealPathMock = vi.mocked(revealPath);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx:366-369"),
      );
    });

    expect(revealPathMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
    );
  });
});
