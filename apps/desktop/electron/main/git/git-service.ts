import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  GitBranchInputSchema,
  GitCommitInputSchema,
  GitCreateRepositoryInputSchema,
  GitFileInputSchema,
  GitInitInputSchema,
  GitLimitInputSchema,
  GitPullRequestInputSchema,
  GitRootsInputSchema,
  GitShaInputSchema,
  GitWorkspaceInputSchema,
} from "../../shared/git";
import type { WorkspaceStore } from "../workspaces/workspace-store";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

type RunFile = (
  executable: string,
  args: readonly string[],
  options: { cwd: string; windowsHide: boolean; timeout: number; maxBuffer: number; encoding: "utf8" },
) => Promise<{ stdout: string; stderr: string }>;

export class GitService {
  readonly #workspaces: WorkspaceStore;
  readonly #runFile: RunFile;

  constructor(workspaces: WorkspaceStore, runFile: RunFile = execFileAsync as RunFile) {
    this.#workspaces = workspaces;
    this.#runFile = runFile;
  }

  async status(input: unknown) {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const cwd = this.#cwd(workspaceId);
    const output = await this.#git(cwd, ["status", "--porcelain=v1", "--branch", "-z"]);
    const segments = output.split("\0").filter(Boolean);
    const branchHeader = segments.shift() ?? "## HEAD";
    const files = segments.map(parseStatusEntry);
    const stagedFiles = files.filter((file) => file.status[0] !== " " && file.status[0] !== "?");
    const unstagedFiles = files.filter((file) => file.status[1] !== " " || file.status === "??");
    const totals = await this.#diffTotals(cwd);
    return {
      branchName: parseBranchName(branchHeader),
      files,
      stagedFiles,
      unstagedFiles,
      totalAdditions: totals.additions,
      totalDeletions: totals.deletions,
    };
  }

  async init(input: unknown) {
    const request = GitInitInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    if (await this.#isRepository(cwd)) return { status: "already_initialized" };
    const entries = await this.#directoryEntryCount(cwd);
    if (entries > 0 && !request.force) {
      return { status: "needs_confirmation", entryCount: entries };
    }
    await this.#git(cwd, ["init", "-b", request.branch]);
    await this.#git(cwd, ["add", "--all"]);
    try {
      await this.#git(cwd, ["commit", "-m", "Initial commit"]);
      return { status: "initialized" };
    } catch (error) {
      return { status: "initialized", commitError: errorMessage(error) };
    }
  }

  async createGitHubRepository(input: unknown) {
    const request = GitCreateRepositoryInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const args = ["repo", "create", request.repo, `--${request.visibility}`, "--source", ".", "--remote", "origin"];
    if (request.branch) await this.#git(cwd, ["branch", "-M", request.branch]);
    await this.#gh(cwd, args);
    await this.#git(cwd, ["push", "-u", "origin", request.branch || "HEAD"]);
    return { status: "ok", repo: request.repo, remoteUrl: await this.remote({ workspaceId: request.workspaceId }) };
  }

  async roots(input: unknown): Promise<string[]> {
    const request = GitRootsInputSchema.parse(input);
    const root = this.#cwd(request.workspaceId);
    const depth = request.depth ?? 4;
    const results = new Set<string>();
    await walkDirectories(root, depth, async (directory) => {
      if (await this.#isRepository(directory)) results.add(directory);
    });
    return [...results];
  }

  async diffs(input: unknown) {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const cwd = this.#cwd(workspaceId);
    const status = await this.status({ workspaceId });
    return Promise.all(status.files.map(async (file) => ({
      path: file.path,
      diff: await this.#git(cwd, ["diff", "--no-ext-diff", "HEAD", "--", file.path]).catch(() => ""),
      isBinary: false,
      isImage: isImagePath(file.path),
    })));
  }

  async log(input: unknown) {
    const request = GitLimitInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const limit = request.limit ?? 40;
    const stdout = await this.#git(cwd, ["log", `-${limit}`, "--format=%H%x00%s%x00%an%x00%ct%x00"]);
    const entries = parseLog(stdout);
    const upstream = (await this.#git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).catch(() => "")).trim() || null;
    const counts = upstream
      ? parseAheadBehind(await this.#git(cwd, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]))
      : { behind: 0, ahead: 0 };
    return { total: entries.length, entries, ...counts, aheadEntries: [], behindEntries: [], upstream };
  }

  async commitDiff(input: unknown) {
    const request = GitShaInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const names = await this.#git(cwd, ["diff-tree", "--no-commit-id", "--name-status", "-r", request.sha]);
    return Promise.all(names.split(/\r?\n/).filter(Boolean).map(async (line) => {
      const [status, ...parts] = line.split("\t");
      const filePath = parts.at(-1) ?? "";
      return {
        path: filePath,
        status,
        diff: await this.#git(cwd, ["show", "--format=", "--no-ext-diff", request.sha, "--", filePath]),
        isBinary: false,
        isImage: isImagePath(filePath),
      };
    }));
  }

  async remote(input: unknown): Promise<string | null> {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const value = await this.#git(this.#cwd(workspaceId), ["remote", "get-url", "origin"]).catch(() => "");
    return value.trim() || null;
  }

  stageFile(input: unknown) { return this.#fileCommand(input, ["add"]); }
  stageAll(input: unknown) { return this.#workspaceCommand(input, ["add", "--all"]); }
  unstageFile(input: unknown) { return this.#fileCommand(input, ["restore", "--staged"]); }
  revertFile(input: unknown) { return this.#fileCommand(input, ["restore"]); }
  revertAll(input: unknown) { return this.#workspaceCommand(input, ["restore", "."]); }
  push(input: unknown) { return this.#workspaceCommand(input, ["push"]); }
  pull(input: unknown) { return this.#workspaceCommand(input, ["pull", "--ff-only"]); }
  fetch(input: unknown) { return this.#workspaceCommand(input, ["fetch", "--all", "--prune"]); }

  async sync(input: unknown) {
    const request = GitWorkspaceInputSchema.parse(input);
    await this.pull(request);
    await this.push(request);
    return { ok: true };
  }

  async commit(input: unknown) {
    const request = GitCommitInputSchema.parse(input);
    await this.#git(this.#cwd(request.workspaceId), ["commit", "-m", request.message]);
    return { ok: true };
  }

  async branches(input: unknown) {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const cwd = this.#cwd(workspaceId);
    const stdout = await this.#git(cwd, ["branch", "--format=%(refname:short)"]);
    const current = (await this.#git(cwd, ["branch", "--show-current"])).trim();
    const branches = stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      .map((name) => ({ name, isCurrent: name === current }));
    return { branches };
  }

  checkoutBranch(input: unknown) { return this.#branchCommand(input, ["switch"]); }
  createBranch(input: unknown) { return this.#branchCommand(input, ["switch", "-c"]); }

  async issues(input: unknown) {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const issues = JSON.parse(await this.#gh(this.#cwd(workspaceId), [
      "issue", "list", "--limit", "100", "--json", "number,title,url,updatedAt",
    ]));
    return { total: issues.length, issues };
  }

  async pullRequests(input: unknown) {
    const { workspaceId } = GitWorkspaceInputSchema.parse(input);
    const pullRequests = JSON.parse(await this.#gh(this.#cwd(workspaceId), [
      "pr", "list", "--limit", "100", "--json",
      "number,title,url,updatedAt,createdAt,body,headRefName,baseRefName,isDraft,author",
    ]));
    return { total: pullRequests.length, pullRequests };
  }

  async pullRequestDiff(input: unknown) {
    const request = GitPullRequestInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const repo = await this.#repositoryName(cwd);
    const files = JSON.parse(await this.#gh(cwd, [
      "api", `repos/${repo}/pulls/${request.prNumber}/files`, "--paginate",
    ]));
    return files.map((file: Record<string, unknown>) => ({
      path: String(file.filename ?? ""),
      status: String(file.status ?? "modified"),
      diff: String(file.patch ?? ""),
    }));
  }

  async pullRequestComments(input: unknown) {
    const request = GitPullRequestInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const repo = await this.#repositoryName(cwd);
    const comments = JSON.parse(await this.#gh(cwd, [
      "api", `repos/${repo}/issues/${request.prNumber}/comments`, "--paginate",
    ]));
    return comments.map((comment: Record<string, unknown>) => ({
      id: Number(comment.id),
      body: String(comment.body ?? ""),
      createdAt: String(comment.created_at ?? ""),
      url: String(comment.html_url ?? ""),
      author: comment.user && typeof comment.user === "object"
        ? { login: String((comment.user as Record<string, unknown>).login ?? "") }
        : null,
    }));
  }

  async checkoutPullRequest(input: unknown) {
    const request = GitPullRequestInputSchema.parse(input);
    await this.#gh(this.#cwd(request.workspaceId), ["pr", "checkout", String(request.prNumber)]);
    return { ok: true };
  }

  async #fileCommand(input: unknown, args: string[]) {
    const request = GitFileInputSchema.parse(input);
    const cwd = this.#cwd(request.workspaceId);
    const relative = requireRelativeWorkspacePath(cwd, request.path);
    await this.#git(cwd, [...args, "--", relative]);
    return { ok: true };
  }

  async #branchCommand(input: unknown, args: string[]) {
    const request = GitBranchInputSchema.parse(input);
    await this.#git(this.#cwd(request.workspaceId), [...args, request.name]);
    return { ok: true };
  }

  async #workspaceCommand(input: unknown, args: string[]) {
    const request = GitWorkspaceInputSchema.parse(input);
    await this.#git(this.#cwd(request.workspaceId), args);
    return { ok: true };
  }

  #cwd(workspaceId: string): string { return this.#workspaces.require(workspaceId).path; }
  #git(cwd: string, args: string[]): Promise<string> {
    return this.#run(process.platform === "win32" ? "git.exe" : "git", cwd, args);
  }
  #gh(cwd: string, args: string[]): Promise<string> {
    return this.#run(process.platform === "win32" ? "gh.exe" : "gh", cwd, args);
  }

  async #run(executable: string, cwd: string, args: string[]): Promise<string> {
    try {
      const result = await this.#runFile(executable, args, {
        cwd, windowsHide: true, timeout: 120_000, maxBuffer: MAX_BUFFER, encoding: "utf8",
      });
      return result.stdout;
    } catch (error) {
      throw new Error(`${path.basename(executable)} 执行失败：${errorMessage(error)}`);
    }
  }

  async #diffTotals(cwd: string) {
    const output = await this.#git(cwd, ["diff", "HEAD", "--numstat"]).catch(() => "");
    return output.split(/\r?\n/).filter(Boolean).reduce(
      (totals, line) => {
        const [additions, deletions] = line.split("\t");
        totals.additions += Number(additions) || 0;
        totals.deletions += Number(deletions) || 0;
        return totals;
      },
      { additions: 0, deletions: 0 },
    );
  }

  async #isRepository(cwd: string): Promise<boolean> {
    return (await this.#git(cwd, ["rev-parse", "--is-inside-work-tree"]).catch(() => "false")).trim() === "true";
  }

  async #directoryEntryCount(cwd: string): Promise<number> {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(cwd)).length;
  }

  async #repositoryName(cwd: string): Promise<string> {
    const result = JSON.parse(await this.#gh(cwd, ["repo", "view", "--json", "nameWithOwner"]));
    if (!result.nameWithOwner) throw new Error("无法解析 GitHub repository");
    return String(result.nameWithOwner);
  }
}

function parseStatusEntry(entry: string) {
  const status = entry.slice(0, 2);
  const rawPath = entry.slice(3);
  const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)! : rawPath;
  return { path: filePath, status, additions: 0, deletions: 0 };
}

function parseBranchName(header: string): string {
  return header.replace(/^##\s*/, "").split(/[. ]/)[0] || "HEAD";
}

function parseLog(output: string) {
  const fields = output.split("\0");
  const entries = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const sha = fields[index]?.trim();
    if (!sha) continue;
    entries.push({
      sha,
      summary: fields[index + 1] ?? "",
      author: fields[index + 2] ?? "",
      timestamp: Number(fields[index + 3]) || 0,
    });
  }
  return entries;
}

function parseAheadBehind(output: string) {
  const [behind, ahead] = output.trim().split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

function requireRelativeWorkspacePath(root: string, value: string): string {
  if (path.isAbsolute(value)) throw new Error("Git file path 必须是 workspace 相对路径");
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Git file path 越出 workspace");
  }
  return relative;
}

function isImagePath(value: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|bmp|tiff?|ico)$/i.test(value);
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  const message = String(record.stderr || record.message || error).trim();
  return message.replace(/[A-Z]:\\[^\s"']+/giu, "<path>").slice(0, 2_000);
}

async function walkDirectories(
  root: string,
  depth: number,
  visit: (directory: string) => Promise<void>,
): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  await visit(root);
  if (depth === 0) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
    await walkDirectories(path.join(root, entry.name), depth - 1, visit);
  }
}
