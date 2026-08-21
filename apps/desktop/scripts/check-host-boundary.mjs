import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = path.resolve(desktopRoot, "../..");
const roots = [
  "src",
  "electron",
  "public",
  "resources",
  "scripts",
  ".github",
].map((entry) => path.join(desktopRoot, entry));
roots.push(path.join(repositoryRoot, ".github", "workflows"));
roots.push(path.join(repositoryRoot, "scripts"));

const topLevelFiles = [
  "package.json",
  "package-lock.json",
  "forge.config.ts",
  "vite.config.ts",
  "vite.main.config.ts",
  "vite.preload.config.ts",
  "README.md",
  "README.zh-CN.md",
].map((entry) => path.join(desktopRoot, entry));

const forbidden = [
  { label: "旧宿主名称", pattern: /\btauri\b/iu },
  { label: "旧宿主 package", pattern: /@tauri-apps/iu },
  { label: "旧宿主源码目录", pattern: /src-tauri/iu },
  { label: "旧 daemon", pattern: /blackrain_daemon/iu },
  { label: "旧固定端口", pattern: /127\.0\.0\.1:4732/u },
  { label: "旧 callback bridge", pattern: /transformCallback/u },
  { label: "旧安装器", pattern: /nsis/iu },
  { label: "裸 legacy invoke", pattern: /(?<![.\w])invoke\s*\(/u },
  { label: "裸 legacy listen", pattern: /(?<![.\w])listen\s*\(/u },
];
const ignoredDirectories = new Set(["node_modules", "out", "output", "dist", ".vite"]);
const textExtensions = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsx", ".mjs", ".md",
  ".ps1", ".sh", ".ts", ".tsx", ".yaml", ".yml",
]);

async function collectFiles(candidate) {
  try {
    const entries = await readdir(candidate, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolute = path.join(candidate, entry.name);
      if (entry.isDirectory()) files.push(...await collectFiles(absolute));
      else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
    }
    return files;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return [];
    throw error;
  }
}

const files = [...new Set([
  ...(await Promise.all(roots.map(collectFiles))).flat(),
  ...topLevelFiles,
])];
const scannerPaths = new Set([
  fileURLToPath(import.meta.url),
  path.join(desktopRoot, "scripts", "audit-electron-package.mjs"),
].map((entry) => path.resolve(entry)));
const violations = [];
for (const file of files) {
  if (scannerPaths.has(path.resolve(file))) continue;
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  const lines = contents.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of forbidden) {
      if (rule.pattern.test(lines[index])) {
        violations.push({ file, line: index + 1, label: rule.label, text: lines[index].trim() });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Native Clean Gate 失败：");
  for (const violation of violations) {
    console.error(`- ${path.relative(repositoryRoot, violation.file)}:${violation.line} [${violation.label}] ${violation.text}`);
  }
  process.exit(1);
}

console.log(`Native Clean Gate 通过：扫描 ${files.length} 个生产边界文件，旧宿主残留为 0。`);
