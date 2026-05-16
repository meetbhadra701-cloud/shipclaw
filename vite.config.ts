import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@agent": resolve(__dirname, "src/agent"),
      "@tools": resolve(__dirname, "src/tools"),
      "@storage": resolve(__dirname, "src/storage"),
      "@llm": resolve(__dirname, "src/llm"),
      "@server": resolve(__dirname, "src/server"),
      "@ui": resolve(__dirname, "src/ui"),
    },
  },
});
