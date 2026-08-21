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
      external: ["electron"],
      output: {
        entryFileNames: "main.cjs",
        format: "cjs",
      },
    },
  },
});
