import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  // Gli asset della PWA li copia scripts/build-docs.mjs: così in docs/ non finisce l'anteprima __grok.
  publicDir: false,
  plugins: [viteReact(), tailwindcss()],
  build: {
    outDir: "docs",
    emptyOutDir: false,
    // Un solo style.css accanto al bundle, invece del CSS iniettato dentro app.js.
    cssCodeSplit: false,
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
