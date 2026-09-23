#!/usr/bin/env bun
/**
 * problems/ と results/ と site/charts.yaml から生成する:
 *
 *   - site/dist/index.html      … 結果ページ（1枚もの）
 *   - site/overall-score.svg    … 総合スコアのグラフ単体。README に貼る用
 *
 *   bun run site/build.ts [--out site/dist]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { overallBarChart } from "./src/charts";
import { OVERALL_TITLE, loadDataset } from "./src/data";
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

// README に貼る用の単体 SVG。GitHub がサニタイズしても崩れないよう、
// style/class を使わず全部プレゼンテーション属性で塗ってある。
const svg = overallBarChart(data.models, {
  standalone: true,
  title: OVERALL_TITLE,
  hiddenModelIds: data.charts.overall.hidden_model_ids,
});
const svgFile = join(here, "overall-score.svg");
writeFileSync(svgFile, svg);

console.log(
  `built ${outFile}  (${data.models.length} models × ${data.problems.length} problems, ${
    (html.length / 1024) | 0
  } KB)`,
);
console.log(`built ${svgFile}  (${(svg.length / 1024) | 0} KB)`);
