import { Resvg } from "@resvg/resvg-js";
import type { Dataset } from "./data";
import { esc, overallBarChart } from "./charts";

/** X / Facebook などのリンクカードの推奨サイズ（1.91:1） */
export const OGP_WIDTH = 1200;
export const OGP_HEIGHT = 630;
/** カードに載せる会社数の上限。これ以上は字が潰れて読めない */
const TOP_N = 8;

/**
 * リンクカード用の画像。総合スコアの上位だけを抜き出した横棒グラフに見出しを付ける。
 * SVG はリンクカードに使えないので PNG に焼く。
 */
export function renderOgpImage(data: Dataset, title: string): Buffer {
  const hidden = new Set(data.charts.overall.hidden_model_ids);
  // 同じ会社が並ぶと見どころがないので、各社いちばん点の高いモデルだけ載せる
  const seen = new Set<string>();
  const top = data.models
    .filter((m) => !hidden.has(m.id))
    .filter((m) => !seen.has(m.creator) && !!seen.add(m.creator))
    .slice(0, TOP_N);
  // README 用と同じく属性だけで塗った単体 SVG を中に入れ子にする
  const chart = overallBarChart(top, { standalone: true });
  // 外側の <svg> に同じ viewBox を付けて、枠に収まるよう縮める
  const [, cw, ch] = chart.match(/viewBox="0 0 (\d+) (\d+)"/)!;

  const pad = 40;
  const headH = 134;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OGP_WIDTH} ${OGP_HEIGHT}" width="${OGP_WIDTH}" height="${OGP_HEIGHT}" font-family="sans-serif">
  <rect width="${OGP_WIDTH}" height="${OGP_HEIGHT}" fill="#f9f9f7"/>
  <text x="${pad}" y="${pad + 40}" fill="#0b0b0b" font-size="44" font-weight="700">${esc(title)}</text>
  <text x="${pad}" y="${pad + 78}" fill="#52514e" font-size="22">人間がブラインドで採点した総合スコア 各社トップモデル（100点満点）</text>
  <svg x="${pad}" y="${headH}" width="${OGP_WIDTH - pad * 2}" height="${
    OGP_HEIGHT - headH - pad / 2
  }" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="xMidYMin meet">
${chart}</svg>
</svg>
`;

  return new Resvg(svg, {
    font: {
      loadSystemFonts: true,
      // CI では fonts-noto-cjk を入れて使う
      defaultFontFamily: "Noto Sans CJK JP",
      sansSerifFamily: "Noto Sans CJK JP",
    },
  })
    .render()
    .asPng();
}
