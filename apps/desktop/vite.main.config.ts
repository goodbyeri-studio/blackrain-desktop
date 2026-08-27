import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __BLACKRAIN_UPDATE_MANIFEST_URL__: JSON.stringify(
      process.env.BLACKRAIN_UPDATE_MANIFEST_URL ?? "",
    ),
    __BLACKRAIN_UPDATE_PUBLISHER__: JSON.stringify(
      process.env.BLACKRAIN_UPDATE_PUBLISHER ?? "",
    ),
    __BLACKRAIN_UPDATE_PUBLIC_KEY__: JSON.stringify(
      process.env.BLACKRAIN_UPDATE_PUBLIC_KEY ?? "",
    ),
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      // node-pty 必须 external：它是原生模块，自己的 loader 会按
      // `<模块目录>/prebuilds/<platform>-<arch>/pty.node` 解析 .node 文件。
      // 一旦被打进 main.cjs，解析基准就变成 bundle 所在目录，得到
      // `./prebuilds/darwin-arm64//pty.node` 这种不存在的路径并抛错——
      // 而该错误发生在 import 求值期，会让 main 在任何自有代码之前就死掉。
      external: ["electron", "node-pty"],
      output: {
        entryFileNames: "main.cjs",
        format: "cjs",
      },
    },
  },
});
