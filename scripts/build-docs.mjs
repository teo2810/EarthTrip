#!/usr/bin/env node
/**
 * Build della copia statica per GitHub Pages in docs/.
 *
 *   npm run build:docs -- 20
 *
 * - compila src/static-main.tsx con vite.client.config.ts (bundle IIFE + style.css estratto);
 * - rinomina docs/app.js in docs/app-v<N>.js e cancella i bundle delle versioni precedenti;
 * - copia da public/ solo gli asset della PWA (niente file dell'anteprima __grok);
 * - aggiorna index.html (bundle e ?v= del CSS) e sw.js (nome della cache e lista dei file).
 */
import { build } from "vite";
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const version = process.argv[2] ?? process.env.npm_config_version_tag;
if (!version || !/^\d+$/.test(version)) {
  console.error("Uso: node scripts/build-docs.mjs <versione numerica>, es. 20");
  process.exit(1);
}
const bundle = `app-v${version}.js`;

await build({ root, configFile: join(root, "vite.client.config.ts"), logLevel: "error" });

if (!existsSync(join(docs, "app.js"))) throw new Error("vite non ha prodotto docs/app.js");
renameSync(join(docs, "app.js"), join(docs, bundle));
if (!existsSync(join(docs, "style.css"))) throw new Error("vite non ha prodotto docs/style.css");
if (readFileSync(join(docs, bundle), "utf8").includes("/*! tailwindcss")) throw new Error("il CSS è ancora dentro il bundle");

for (const name of readdirSync(docs)) {
  if (/^app-v\d+\.js$/.test(name) && name !== bundle) rmSync(join(docs, name));
}
rmSync(join(docs, "__grok"), { recursive: true, force: true });

const PUBLIC_ASSETS = ["favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "og.jpg"];
for (const name of PUBLIC_ASSETS) copyFileSync(join(root, "public", name), join(docs, name));

const edit = (file, fn) => {
  const path = join(docs, file);
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  writeFileSync(path, after);
};
edit("index.html", (s) => s.replace(/app-v\d+\.js/g, bundle).replace(/style\.css(\?v=\d+)?/g, `style.css?v=${version}`));
edit("sw.js", (s) => s.replace(/earthtrip-v\d+(-defense)?/g, `earthtrip-v${version}`).replace(/app-v\d+\.js/g, bundle));

const kb = (f) => `${(statSync(join(docs, f)).size / 1024).toFixed(0)} KB`;
console.log(`docs/${bundle} ${kb(bundle)} · docs/style.css ${kb("style.css")} · cache earthtrip-v${version}`);
