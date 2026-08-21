import type { Rectangle } from "electron";

export const BROWSER_PARTITION = "persist:blackrain-browser-app";

export function normalizeBrowserUrl(input: string): string {
  const value = input.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Browser URL 必须是完整的 http/https 地址");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Browser 只允许 http/https 导航");
  }
  if (url.username || url.password) {
    throw new Error("Browser URL 不允许内嵌凭据");
  }
  return url.toString();
}

export function isAllowedPageNavigation(target: string): boolean {
  if (target === "about:blank") {
    return true;
  }
  try {
    const url = new URL(target);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function clampBrowserBounds(
  bounds: Rectangle,
  contentSize: readonly [number, number],
): Rectangle {
  const [contentWidth, contentHeight] = contentSize;
  const x = Math.min(Math.max(0, bounds.x), contentWidth);
  const y = Math.min(Math.max(0, bounds.y), contentHeight);
  return {
    x,
    y,
    width: Math.min(Math.max(0, bounds.width), Math.max(0, contentWidth - x)),
    height: Math.min(
      Math.max(0, bounds.height),
      Math.max(0, contentHeight - y),
    ),
  };
}
