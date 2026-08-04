import { extractFile, listPackage } from "@electron/asar";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const packageRoot = path.join(desktopRoot, "out", "electron", "blackrain-win32-x64");
const resourcesRoot = path.join(packageRoot, "resources");
const asarPath = path.join(resourcesRoot, "app.asar");
const makeRoot = path.join(desktopRoot, "out", "electron", "make");
const requireMsix = process.argv.includes("--require-msix");
const expectedResources = new Set([
  "app.asar",
  "browser-client",
  "codex",
  "icon.png",
  "node-runtime",
]);
const forbidden = [
  { label: "旧宿主名称", pattern: /tauri/iu },
  { label: "旧宿主 package", pattern: /@tauri-apps/iu },
  { label: "旧 daemon", pattern: /blackrain_daemon/iu },
  { label: "旧固定端口", pattern: /127\.0\.0\.1:4732/u },
  { label: "旧安装器", pattern: /\bnsis\b/iu },
  { label: "旧 callback bridge", pattern: /transformCallback/u },
];

async function requireDirectory(candidate, label) {
  const info = await stat(candidate).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`${label} 不存在：${candidate}`);
}

async function collectFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function auditText(label, value, violations) {
  for (const rule of forbidden) {
    if (rule.pattern.test(value)) violations.push(`${label} [${rule.label}]`);
  }
}

await requireDirectory(packageRoot, "Electron package");
await requireDirectory(resourcesRoot, "Electron resources");

const resourceEntries = await readdir(resourcesRoot);
const unexpectedResources = resourceEntries.filter((entry) => !expectedResources.has(entry));
const missingResources = [...expectedResources].filter((entry) => !resourceEntries.includes(entry));
if (unexpectedResources.length > 0 || missingResources.length > 0) {
  throw new Error([
    unexpectedResources.length > 0 ? `未登记 resources：${unexpectedResources.join(", ")}` : "",
    missingResources.length > 0 ? `缺少 resources：${missingResources.join(", ")}` : "",
  ].filter(Boolean).join("；"));
}

const violations = [];
for (const file of await collectFiles(packageRoot)) {
  auditText(path.relative(packageRoot, file), path.relative(packageRoot, file), violations);
}

const asarEntries = listPackage(asarPath);
for (const entry of asarEntries) auditText(`app.asar:${entry}`, entry, violations);
const runtimeTextEntries = asarEntries.filter((entry) =>
  /^(?:\\?\.vite[\\/](?:build|renderer)[\\/].*\.(?:cjs|css|html|js|json)|\\?package\.json)$/iu.test(entry),
);
for (const entry of runtimeTextEntries) {
  const contents = extractFile(asarPath, entry.replace(/^\\/u, "")).toString("utf8");
  auditText(`app.asar:${entry}`, contents, violations);
}

for (const relative of [
  "browser-client/manifest.json",
  "browser-client/LICENSE.txt",
  "codex/runtime-lock.json",
  "node-runtime/runtime-lock.json",
]) {
  await readFile(path.join(resourcesRoot, relative));
}

let msixCount = 0;
const makeFiles = await collectFiles(makeRoot).catch(() => []);
for (const msixPath of makeFiles.filter((file) => file.toLowerCase().endsWith(".msix"))) {
  msixCount += 1;
  const entries = execFileSync("tar.exe", ["-tf", msixPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  }).split(/\r?\n/u).filter(Boolean);
  for (const entry of entries) auditText(`${path.basename(msixPath)}:${entry}`, entry, violations);
  for (const expected of ["AppxManifest.xml", "app/resources/app.asar"]) {
    if (!entries.includes(expected)) violations.push(`${path.basename(msixPath)} 缺少 ${expected}`);
  }
  const manifest = execFileSync("tar.exe", ["-xOf", msixPath, "AppxManifest.xml"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  auditText(`${path.basename(msixPath)}:AppxManifest.xml`, manifest, violations);
}
if (requireMsix && msixCount === 0) violations.push("maker 未生成 MSIX");

if (violations.length > 0) {
  throw new Error(`Electron package 原生资源审计失败：\n${violations.map((item) => `- ${item}`).join("\n")}`);
}

console.log(
  `Electron package 原生资源审计通过：${resourceEntries.length} 个顶层资源，` +
  `${asarEntries.length} 个 ASAR 条目，${msixCount} 个 MSIX。`,
);
