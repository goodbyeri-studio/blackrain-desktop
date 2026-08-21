import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirectories = new Set([
  ".git",
  ".scratch",
  ".vite",
  "codex-upstream",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "output",
]);

async function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(absolute));
    else if (entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function localTarget(rawTarget) {
  let target = rawTarget.trim();
  if (!target || target.startsWith("#")) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target) || target.startsWith("//")) return null;

  if (target.startsWith("<")) {
    const closing = target.indexOf(">");
    if (closing === -1) return target;
    target = target.slice(1, closing);
  } else {
    target = target.replace(/\s+["'][^"']*["']\s*$/u, "");
  }

  target = target.split("#", 1)[0].split("?", 1)[0];
  if (!target || path.isAbsolute(target)) return null;
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

const failures = [];
const markdownFiles = await collectMarkdownFiles(repositoryRoot);
for (const file of markdownFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = localTarget(match[1]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    try {
      await stat(resolved);
    } catch {
      failures.push(`${path.relative(repositoryRoot, file)} -> ${match[1].trim()}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Documentation links valid: ${markdownFiles.length} Markdown files checked.`);
