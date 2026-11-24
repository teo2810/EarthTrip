import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [viteReact(), tailwindcss()],
  build: {
    outDir: "docs",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/static-main.tsx"),
      output: {
        format: "iife",
        entryFileNames: "app.js",
        inlineDynamicImports: true,
        assetFileNames: (asset) => {
          if (asset.names?.[0]?.endsWith(".css") || asset.name?.endsWith(".css")) return "style.css";
          return "[name][extname]";
        },
      },
    },
  },
  resolve: { tsconfigPaths: true },
});
