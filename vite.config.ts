import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    exclude: ["node_modules/**", "dist/**", "release/**", "output/**"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@fluentui") || id.includes("@griffel")) {
            return "fluent-ui";
          }
          if (id.includes("react")) return "react";
          return undefined;
        },
      },
    },
  },
});
