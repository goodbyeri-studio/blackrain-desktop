import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBrowserClient } from "./verify-browser-client.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("Browser client 制品完整性", () => {
  it("接受仓库锁定的 client/hash/license", async () => {
    await expect(verifyBrowserClient()).resolves.toBeUndefined();
  });

  it("拒绝 client 内容与 manifest 摘要不一致", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "blackrain-browser-client-"));
    temporaryRoots.push(root);
    const sourceRoot = path.resolve("resources/browser-client");
    for (const file of ["manifest.json", "browser-client.mjs", "LICENSE.txt"]) {
      await writeFile(path.join(root, file), await readFile(path.join(sourceRoot, file)));
    }
    await writeFile(path.join(root, "browser-client.mjs"), "export default null;\n");
    await expect(verifyBrowserClient(root)).rejects.toThrow(/摘要不一致/);
  });
});
