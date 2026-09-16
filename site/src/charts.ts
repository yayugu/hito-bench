import type { ModelRow } from "./data";
import { paretoFrontier } from "./data";
import { brandMarkSvg, creatorColor } from "./colors";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const fmt1 = (n: number) => n.toFixed(1);
const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function fmtCost(usd: number): string {
  return usd >= 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(5)}`;
}

/** 目盛りを 0 から「きれいな」上限まで刻む */
function niceTicks(max: number): { max: number; ticks: number[] } {
  const candidates = [10, 20, 25, 50, 100];
  const step = candidates.find((c) => max <= c * 5) ?? 200;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { max: top, ticks };
}

interface BarDatum {
  label: string;
  value: number;
  href: string;
  /** 会社ごとの色 */
  color: string;
  /** ロゴ・スウォッチを出すための提供元 */
  creator: string;
  /** ツールチップ用の補足 */
  detail: string;
  incomplete?: boolean;
}

/**
 * 横棒グラフ。棒の色は提供元の会社ごと（凡例はページ上部に1つ置く）。
 */
export function barChart(data: BarDatum[], opts: { valueSuffix?: string } = {}): string {
  const suffix = opts.valueSuffix ?? "";
  const labelW = 206;
  const ICON = 13;
  const iconX = labelW - 10 - ICON; // 棒の手前に揃えたロゴの列
  const textRight = iconX - 7;
  const valueW = 56;
  const band = 30;
  const barH = 18; // <= 24px
  const padTop = 26;
  const padBottom = 30;
  const plotW = 760;
  const width = labelW + plotW + valueW;
  const height = padTop + data.length * band + padBottom;

  const { max, ticks } = niceTicks(Math.max(...data.map((d) => d.value), 1));
  const x = (v: number) => labelW + (v / max) * plotW;

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${fmt1(x(t))}" y1="${padTop - 8}" x2="${fmt1(
          x(t),
        )}" y2="${padTop + data.length * band}"/>`,
    )
    .join("");

  const axis = ticks
    .map(
      (t) =>
        `<text class="tick" x="${fmt1(x(t))}" y="${
          padTop + data.length * band + 18
        }" text-anchor="middle">${t}</text>`,
    )
    .join("");

  const bars = data
    .map((d, i) => {
      const y = padTop + i * band + (band - barH) / 2;
      const w = Math.max((d.value / max) * plotW, 0);
      const mark = d.incomplete ? "*" : "";
      const cy = y + barH / 2;
      // 行ぜんたいをリンクにする（ラベルでも棒でもクリックできる）
      return `<a class="bar-row" href="${esc(
        d.href,
      )}" target="_blank" rel="noopener" data-tip="${esc(d.detail)}">
  <rect class="bar-hit" x="0" y="${padTop + i * band}" width="${width}" height="${band}"/>
  ${brandMarkSvg(d.creator, iconX, cy - ICON / 2, ICON)}
  <text class="bar-label" x="${textRight}" y="${
        cy
      }" text-anchor="end" dominant-baseline="central">${esc(d.label)}${mark}</text>
  <path class="bar" fill="${d.color}" d="${roundedBar(labelW, y, w, barH)}"/>
  <text class="bar-value" x="${fmt1(labelW + w + 8)}" y="${
        y + barH / 2
      }" dominant-baseline="central">${fmtScore(d.value)}${suffix}</text>
</a>`;
    })
    .join("\n");

  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
${grid}
${axis}
${bars}
</svg></div>`;
}

/** 棒の先だけ 4px 丸め、ベースライン側は角のまま */
function roundedBar(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w);
  if (w <= 0.5) return `M${x} ${y}h0.5v${h}h-0.5z`;
  return [
    `M${fmt1(x)} ${fmt1(y)}`,
    `H${fmt1(x + w - r)}`,
    `a${r} ${r} 0 0 1 ${r} ${r}`,
    `V${fmt1(y + h - r)}`,
    `a${r} ${r} 0 0 1 -${r} ${r}`,
    `H${fmt1(x)}`,
    `Z`,
  ].join(" ");
}

export function overallBarChart(models: ModelRow[]): string {
  return barChart(
    models.map((m) => ({
      label: m.label,
      value: m.score,
      href: m.githubUrl,
      color: creatorColor(m.creator),
      creator: m.creator,
      detail: `${m.label}（${m.creator}） — ${fmtScore(m.score)}点 / ${m.cells.size}問平均`,
      incomplete: !m.complete,
    })),
  );
}

export function problemBarChart(models: ModelRow[], problemId: string): string {
  const rows = models
    .filter((m) => m.cells.has(problemId))
    .map((m) => {
      const cell = m.cells.get(problemId)!;
      return {
        label: m.label,
        value: cell.score,
        href: cell.githubUrl,
        color: creatorColor(m.creator),
        creator: m.creator,
        detail: `${m.label}（${m.creator}） — ${fmtScore(cell.score)}点`,
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return barChart(rows);
}

/**
 * スコア vs 推定コストの散布図。コスト軸は対数。
 * 左上（安くて高得点）が「コスパ良いゾーン」、
 * その外側を通るのが「パレート最適ライン」。
 */
export function scatterChart(models: ModelRow[]): string {
  const pts = models.filter((m) => m.costPerTask > 0);
  if (pts.length === 0) return "";

  const width = 1004;
  const height = 520;
  const pad = { top: 34, right: 116, bottom: 58, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const costs = pts.map((p) => p.costPerTask);
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...costs))));
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...costs))));
  const x = (c: number) =>
    pad.left + ((Math.log10(c) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * plotW;

  const { max: yMax, ticks: yTicks } = niceTicks(Math.max(...pts.map((p) => p.score)));
  const y = (s: number) => pad.top + plotH - (s / yMax) * plotH;

  const xTicks: number[] = [];
  for (let e = Math.log10(lo); e <= Math.log10(hi) + 1e-9; e += 1) {
    xTicks.push(Math.pow(10, Math.round(e)));
  }

  const front = paretoFrontier(pts);

  // 「最も魅力的な象限」= 中央値より安く、中央値より高得点
  const medianCost = median(costs);
  const medianScore = median(pts.map((p) => p.score));
  const qx = x(medianCost);
  const qy = y(medianScore);

  const grid = [
    ...yTicks.map(
      (t) =>
        `<line class="grid" x1="${pad.left}" y1="${fmt1(y(t))}" x2="${
          pad.left + plotW
        }" y2="${fmt1(y(t))}"/>`,
    ),
    ...xTicks.map(
      (t) =>
        `<line class="grid" x1="${fmt1(x(t))}" y1="${pad.top}" x2="${fmt1(
          x(t),
        )}" y2="${pad.top + plotH}"/>`,
    ),
  ].join("");

  const axes = [
    ...yTicks.map(
      (t) =>
        `<text class="tick" x="${pad.left - 10}" y="${fmt1(
          y(t),
        )}" text-anchor="end" dominant-baseline="central">${t}</text>`,
    ),
    ...xTicks.map(
      (t) =>
        `<text class="tick" x="${fmt1(x(t))}" y="${
          pad.top + plotH + 20
        }" text-anchor="middle">${axisMoney(t)}</text>`,
    ),
    `<text class="axis-title" x="${pad.left + plotW / 2}" y="${
      height - 14
    }" text-anchor="middle">1問あたりの推定コスト (USD・対数軸)</text>`,
    `<text class="axis-title" x="0" y="0" text-anchor="middle" transform="translate(16 ${
      pad.top + plotH / 2
    }) rotate(-90)">スコア</text>`,
  ].join("");

  const quadrant = `<g class="quadrant">
  <rect x="${pad.left}" y="${pad.top}" width="${fmt1(qx - pad.left)}" height="${fmt1(
    qy - pad.top,
  )}"/>
  <text x="${pad.left + 10}" y="${pad.top + 18}">コスパ良いゾーン</text>
</g>`;

  const frontPath = front
    .map((m, i) => `${i === 0 ? "M" : "L"}${fmt1(x(m.costPerTask))} ${fmt1(y(m.score))}`)
    .join(" ");
  // 線そのものに直接ラベルを付けると点のラベルとぶつかるので、
  // 右下にライン見本つきのキーを置く
  const keyY = pad.top + plotH - 16;
  const keyX = pad.left + plotW - 12;
  const pareto =
    front.length > 1
      ? `<g class="pareto">
  <path d="${frontPath}"/>
  <path class="pareto-key" d="M${keyX - 130} ${keyY} h22"/>
  <text x="${keyX - 102}" y="${keyY}" dominant-baseline="central">パレート最適ライン</text>
</g>`
      : "";

  const placed = placeLabels(
    pts.map((m) => ({
      key: m.id,
      cx: x(m.costPerTask),
      cy: y(m.score),
      text: m.label,
    })),
    { left: pad.left, right: pad.left + plotW, top: pad.top, bottom: pad.top + plotH },
  );

  const dots = pts
    .map((m) => {
      const cx = x(m.costPerTask);
      const cy = y(m.score);
      const onFront = front.includes(m);
      const lab = placed.get(m.id)!;
      // ラベルを縦にずらした点だけ引き出し線を足す
      const leader =
        Math.abs(lab.y - cy) > 1
          ? `<line class="leader" x1="${fmt1(cx)}" y1="${fmt1(cy)}" x2="${fmt1(
              lab.anchor === "start" ? lab.x - 3 : lab.x + 3,
            )}" y2="${fmt1(lab.y)}"/>`
          : "";
      return `<g class="dot-row${onFront ? " on-front" : ""}" tabindex="0" data-tip="${esc(
        `${m.label}（${m.creator}） — ${fmtScore(m.score)}点 / 1問 ${fmtCost(
          m.costPerTask,
        )}`,
      )}">
  ${leader}
  <circle class="dot" fill="${creatorColor(m.creator)}" cx="${fmt1(
        cx,
      )}" cy="${fmt1(cy)}" r="${onFront ? 6 : 5}"/>
  <text class="dot-label" x="${fmt1(lab.x)}" y="${fmt1(
        lab.y,
      )}" text-anchor="${lab.anchor}" dominant-baseline="central">${esc(m.label)}</text>
</g>`;
    })
    .join("\n");

  return `<div class="chart-scroll"><svg class="chart scatter" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
${quadrant}
${grid}
${axes}
${pareto}
${dots}
</svg></div>`;
}

function axisMoney(v: number): string {
  if (v >= 1) return `$${v}`;
  return `$${v.toFixed(Math.max(0, -Math.floor(Math.log10(v))))}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface LabelSpot {
  x: number;
  y: number;
  anchor: "start" | "end";
}

/** ラベル幅のざっくり見積り */
function textWidth(text: string, fontSize = 11.5): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! < 128 ? 6.1 : 11.5;
  return (w * fontSize) / 11.5;
}

/**
 * 散布図の点ラベルを、重ならない位置に貪欲に置く。
 * 右→左→斜め上下の順に候補を試し、全滅したら右に置く。
 */
function placeLabels(
  items: { key: string; cx: number; cy: number; text: string }[],
  bounds: { left: number; right: number; top: number; bottom: number },
): Map<string, LabelSpot> {
  const H = 13;
  const GAP = 10;
  const taken: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const out = new Map<string, LabelSpot>();

  const overlaps = (r: { x1: number; y1: number; x2: number; y2: number }) =>
    taken.some((t) => r.x1 < t.x2 && t.x1 < r.x2 && r.y1 < t.y2 && t.y1 < r.y2);

  // 上の点から順に置くと、上位モデルが素直な位置を取れる
  const order = [...items].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  for (const it of order) {
    const w = textWidth(it.text);
    const candidates: LabelSpot[] = [];
    for (const dy of [0, -14, 14, -27, 27]) {
      candidates.push({ x: it.cx + GAP, y: it.cy + dy, anchor: "start" });
      candidates.push({ x: it.cx - GAP, y: it.cy + dy, anchor: "end" });
    }

    let chosen = candidates[0];
    for (const c of candidates) {
      const x1 = c.anchor === "start" ? c.x : c.x - w;
      const rect = { x1, y1: c.y - H / 2, x2: x1 + w, y2: c.y + H / 2 };
      if (rect.x1 < bounds.left - 4 || rect.x2 > bounds.right + 108) continue;
      if (rect.y1 < bounds.top || rect.y2 > bounds.bottom) continue;
      if (overlaps(rect)) continue;
      chosen = c;
      break;
    }

    const cx1 = chosen.anchor === "start" ? chosen.x : chosen.x - w;
    taken.push({ x1: cx1, y1: chosen.y - H / 2, x2: cx1 + w, y2: chosen.y + H / 2 });
    // 点そのものも占有扱いにして、ラベルが他の点にかぶらないようにする
    taken.push({ x1: it.cx - 7, y1: it.cy - 7, x2: it.cx + 7, y2: it.cy + 7 });
    out.set(it.key, chosen);
  }

  return out;
}
