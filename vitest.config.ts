import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@agent": resolve(__dirname, "src/agent"),
      "@tools": resolve(__dirname, "src/tools"),
      "@storage": resolve(__dirname, "src/storage"),
      "@llm": resolve(__dirname, "src/llm"),
    },
  },
});
