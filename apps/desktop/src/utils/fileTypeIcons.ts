const MATERIAL_ICONS_BASE_URL = "/assets/material-icons";
const iconUrlCache = new Map<string, string>();
const ICON_BY_EXTENSION: Readonly<Record<string, string>> = {
  css: "css",
  go: "go",
  htm: "html",
  html: "html",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  jsx: "react",
  md: "markdown",
  mjs: "javascript",
  png: "image",
  ps1: "powershell",
  py: "python",
  rs: "rust",
  sh: "console",
  sql: "database",
  svg: "svg",
  ts: "typescript",
  tsx: "react_ts",
  yaml: "yaml",
  yml: "yaml",
};
const ICON_BY_FILE_NAME: Readonly<Record<string, string>> = {
  ".gitignore": "git",
  "cargo.toml": "rust",
  "package.json": "json",
  "tsconfig.json": "settings",
};

export function getFileTypeIconUrl(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const cached = iconUrlCache.get(normalizedPath);
  if (cached) {
    return cached;
  }
  const pathSegments = normalizedPath.split("/");
  const fileName = pathSegments[pathSegments.length - 1]?.toLowerCase() ?? "";
  const nameSegments = fileName.split(".");
  const extension = fileName.includes(".") ? nameSegments[nameSegments.length - 1] ?? "" : "";
  const icon = ICON_BY_FILE_NAME[fileName] ?? ICON_BY_EXTENSION[extension] ?? "file";
  const iconUrl = `${MATERIAL_ICONS_BASE_URL}/${icon}.svg`;
  iconUrlCache.set(normalizedPath, iconUrl);
  return iconUrl;
}
