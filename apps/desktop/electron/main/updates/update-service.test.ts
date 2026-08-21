import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateService } from "./update-service";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-update-"));
  roots.push(root);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const content = Buffer.from("signed-msix-content");
  const manifest = {
    version: "1.2.3",
    downloadUrl: "https://updates.example/BlackRain.msix",
    sha256: createHash("sha256").update(content).digest("hex"),
    publisher: "CN=BlackRain Test",
  };
  const signature = sign(
    "sha256",
    Buffer.from(JSON.stringify(manifest), "utf8"),
    privateKey,
  ).toString("base64");
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("manifest.json")) {
      return new Response(JSON.stringify({ ...manifest, signature }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(content);
  });
  const openPath = vi.fn(async () => "");
  const service = new UpdateService(root, {
    BLACKRAIN_UPDATE_MANIFEST_URL: "https://updates.example/manifest.json",
    BLACKRAIN_UPDATE_PUBLISHER: manifest.publisher,
    BLACKRAIN_UPDATE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
  }, {
    fetch: fetchMock as typeof fetch,
    currentVersion: () => "1.0.0",
    openPath,
  });
  return { content, fetchMock, manifest, openPath, root, service };
}

describe("UpdateService", () => {
  it("验证签名 manifest 后下载、校验 hash 并交给系统安装器", async () => {
    const { content, manifest, openPath, service } = fixture();

    await expect(service.check()).resolves.toEqual({
      available: true,
      version: manifest.version,
      downloadUrl: manifest.downloadUrl,
      sha256: manifest.sha256,
    });
    const staged = await service.download(manifest);
    expect(readFileSync((staged as { stagedPath: string }).stagedPath)).toEqual(content);
    await service.install({ stagedPath: (staged as { stagedPath: string }).stagedPath });
    expect(openPath).toHaveBeenCalledOnce();
  });

  it("拒绝未通过 main manifest 批准的下载参数", async () => {
    const { manifest, service } = fixture();

    await service.check();
    await expect(service.download({
      ...manifest,
      downloadUrl: "https://attacker.example/payload.msix",
    })).rejects.toThrow("不匹配已验证 manifest");
  });

  it("拒绝签名被篡改的 manifest", async () => {
    const { fetchMock, service } = fixture();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      version: "9.9.9",
      downloadUrl: "https://updates.example/BlackRain.msix",
      sha256: "a".repeat(64),
      publisher: "CN=BlackRain Test",
      signature: Buffer.from("invalid").toString("base64"),
    })));

    await expect(service.check()).rejects.toThrow("manifest 签名校验失败");
  });

  it("拒绝 staging 外部路径和非 MSIX 文件", async () => {
    const { root, service } = fixture();

    await expect(service.install({ stagedPath: path.join(root, "outside.msix") }))
      .rejects.toThrow("不在 staging 目录");
    await expect(service.install({ stagedPath: path.join(root, "updates", "staging", "bad.exe") }))
      .rejects.toThrow("不在 staging 目录");
  });
});
