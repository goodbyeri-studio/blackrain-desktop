import { access } from "node:fs/promises";

const required = [
  "BLACKRAIN_RELEASE_PUBLISHER",
  "BLACKRAIN_UPDATE_MANIFEST_URL",
  "BLACKRAIN_UPDATE_PUBLISHER",
  "BLACKRAIN_UPDATE_PUBLIC_KEY",
  "WINDOWS_CERTIFICATE_FILE",
  "WINDOWS_CERTIFICATE_PASSWORD",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (process.env.BLACKRAIN_RELEASE_SIGNING !== "1") missing.push("BLACKRAIN_RELEASE_SIGNING=1");
if (missing.length > 0) {
  throw new Error(`正式 release 缺少签名配置: ${missing.join(", ")}`);
}
await access(process.env.WINDOWS_CERTIFICATE_FILE);
if (process.env.BLACKRAIN_RELEASE_PUBLISHER !== process.env.BLACKRAIN_UPDATE_PUBLISHER) {
  throw new Error("MSIX publisher 与更新 manifest publisher 必须一致");
}
console.log("正式 release 签名配置检查通过。");
