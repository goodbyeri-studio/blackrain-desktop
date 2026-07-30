import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = path.join(
  desktopRoot,
  "scripts",
  "host-boundary-baseline.json",
);
const commandOwners = new Map([
  ["codex", "codex-app-server-review"],
  ["settings", "electron-main-preload"],
  ["files", "electron-main-preload"],
  ["menu", "electron-main-preload"],
  ["tray", "electron-main-preload"],
  ["workspaces", "electron-main-preload"],
  ["git", "electron-main-preload"],
  ["model_gateway", "gateway-sidecar-supervision"],
  ["prompts", "electron-main-preload"],
  ["terminal", "electron-main-node-pty"],
  ["dictation", "electron-main-preload"],
  ["local_usage", "electron-main-preload"],
  ["notifications", "electron-main-preload"],
  ["account_session", "electron-main-credential-store"],
  ["office", "deferred-delete-review"],
  ["workbench", "deferred-delete-review"],
  ["tailscale", "deferred-delete-review"],
  ["root", "deferred-delete-review"],
]);
const tauriSpecifierPattern =
  /(?:from\s+|import\s*\(\s*)["'](@tauri-apps\/[^"']+|tauri-plugin-liquid-glass-api)["']/g;

async function walkSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSource(absolutePath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function collectDirectTauriImports() {
  const sourceRoot = path.join(desktopRoot, "src");
  const files = await walkSource(sourceRoot);
  const imports = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const match of contents.matchAll(tauriSpecifierPattern)) {
      imports.push({
        file: path.relative(desktopRoot, file).replaceAll(path.sep, "/"),
        specifier: match[1],
      });
    }
  }
  const uniqueImports = new Map(imports.map((entry) => [keyOf(entry), entry]));
  return [...uniqueImports.values()].sort((left, right) =>
    `${left.file}:${left.specifier}`.localeCompare(
      `${right.file}:${right.specifier}`,
    ),
  );
}

async function collectCommandInventory() {
  const libPath = path.join(desktopRoot, "src-tauri", "src", "lib.rs");
  const contents = await readFile(libPath, "utf8");
  const handler = contents.match(
    /\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)\s*\.build/,
  );
  if (!handler) {
    throw new Error("无法定位 src-tauri/src/lib.rs 的 generate_handler 清单");
  }

  return handler[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((command) => {
      const separator = command.indexOf("::");
      const moduleName = separator === -1 ? "root" : command.slice(0, separator);
      return {
        command,
        module: moduleName,
        owner: commandOwners.get(moduleName) ?? null,
      };
    });
}

function keyOf(entry) {
  return `${entry.file}\u0000${entry.specifier}`;
}

const directImports = await collectDirectTauriImports();
const commands = await collectCommandInventory();

if (process.argv.includes("--print-baseline")) {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, directImports }, null, 2)}\n`,
  );
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.directImports)) {
  throw new Error("host-boundary-baseline.json 格式无效");
}

const allowedImports = new Set(baseline.directImports.map(keyOf));
const addedImports = directImports.filter((entry) => !allowedImports.has(keyOf(entry)));
const unownedCommands = commands.filter((entry) => entry.owner === null);

if (addedImports.length > 0) {
  console.error("检测到新增 renderer -> Tauri 直接依赖：");
  for (const entry of addedImports) {
    console.error(`- ${entry.file}: ${entry.specifier}`);
  }
}
if (unownedCommands.length > 0) {
  console.error("检测到未分类的 Tauri command：");
  for (const entry of unownedCommands) {
    console.error(`- ${entry.command}`);
  }
}
if (addedImports.length > 0 || unownedCommands.length > 0) {
  process.exit(1);
}

const ownerCounts = new Map();
for (const command of commands) {
  ownerCounts.set(command.owner, (ownerCounts.get(command.owner) ?? 0) + 1);
}

console.log(
  `宿主边界检查通过：${commands.length} 个 Tauri command 已分类，` +
    `${directImports.length} 个 renderer 直接依赖仍在迁移基线内。`,
);
for (const [owner, count] of [...ownerCounts].sort()) {
  console.log(`- ${owner}: ${count}`);
}
