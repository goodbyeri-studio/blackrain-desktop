import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const sourceDir = join(
  projectRoot,
  "node_modules",
  "vscode-material-icons",
  "generated",
  "icons",
);
const targetDir = join(projectRoot, "public", "assets", "material-icons");
const requiredIcons = new Set([
  "css.svg",
  "console.svg",
  "database.svg",
  "file.svg",
  "git.svg",
  "go.svg",
  "html.svg",
  "image.svg",
  "javascript.svg",
  "json.svg",
  "markdown.svg",
  "powershell.svg",
  "python.svg",
  "react.svg",
  "react_ts.svg",
  "rust.svg",
  "settings.svg",
  "svg.svg",
  "typescript.svg",
  "yaml.svg",
]);

if (!existsSync(sourceDir)) {
  console.warn("[sync:material-icons] source icons directory not found:", sourceDir);
  process.exit(0);
}

await mkdir(dirname(targetDir), { recursive: true });
await rm(targetDir, { recursive: true, force: true });
await copyDirectory(sourceDir, targetDir);
console.log("[sync:material-icons] synced icons to", targetDir);

async function copyDirectory(source, target) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      if (requiredIcons.has(entry.name)) {
        await copyFile(sourcePath, targetPath);
      }
    } else {
      throw new Error(`Unsupported material icon entry: ${sourcePath}`);
    }
  }
}
