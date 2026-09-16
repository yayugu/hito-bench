#!/usr/bin/env bun
/**
 * problems/ と results/ と site/pricing.yaml から静的な1枚もののページを生成する。
 *
 *   bun run site/build.ts [--out site/dist]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "./src/data";
import { renderPage } from "./src/page";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outDir = resolve(root, outIdx >= 0 ? argv[outIdx + 1]! : "site/dist");

const data = loadDataset(root);
const css = readFileSync(join(here, "src", "style.css"), "utf8");
const html = renderPage(data, css);

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "index.html");
writeFileSync(outFile, html);

console.log(
  `built ${outFile}  (${data.models.length} models × ${data.problems.length} problems, ${
    (html.length / 1024) | 0
  } KB)`,
);
