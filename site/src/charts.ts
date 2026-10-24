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

/** class ではなく属性で塗るときの見た目（README 用の単体 SVG 向け） */
const INK = {
  grid: 'stroke="#e1e0d9" stroke-width="1"',
  tick: 'fill="#898781" font-size="11"',
  label: 'fill="#0b0b0b" font-size="14"',
  valueInside: 'fill="#ffffff" font-size="19" font-weight="700"',
  valueOutside: 'fill="#0b0b0b" font-size="13" font-weight="700"',
  title: 'fill="#0b0b0b" font-size="30" font-weight="700"',
  watermark: 'fill="#0b0b0b" fill-opacity="0.09" font-size="30" font-weight="700"',
};

/**
 * 描画エリアの右下にうっすら入れる名前。
 * スクショをそのまま貼っても出どころが分かるように。
 */
function watermark(x: number, y: number, alone = false): string {
  return `<text ${
    alone ? INK.watermark : 'class="watermark"'
  } x="${fmt1(x)}" y="${fmt1(y)}" text-anchor="end">HitoBench</text>`;
}

export interface BarChartOptions {
  valueSuffix?: string;
  /** 単体 SVG の左上に入れる見出し（standalone のときだけ使う） */
  title?: string;
  /**
   * 単体の .svg として書き出すモード。GitHub は README 内の SVG から
   * <style> と class を落とすので、すべてプレゼンテーション属性で塗り、
   * リンクとツールチップも外す。
   */
  standalone?: boolean;
}

export interface OverallBarChartOptions extends BarChartOptions {
  hiddenModelIds?: readonly string[];
}

/**
 * 横棒グラフ。棒の色は提供元の会社ごと（凡例はページ上部に1つ置く）。
 */
export function barChart(data: BarDatum[], opts: BarChartOptions = {}): string {
  const suffix = opts.valueSuffix ?? "";
  const alone = opts.standalone === true;
  const labelW = 232;
  const ICON = 15;
  const iconX = labelW - 11 - ICON; // 棒の手前に揃えたロゴの列
  const textRight = iconX - 8;
  const valueW = 46; // 棒が短くて数字が中に入らないときのはみ出し分
  const band = 44;
  const barH = 30; // 棒の太さは参照元にあわせ、行間は 14px 空ける
  const padTop = 28;
  const padBottom = 32;
  const plotW = 740;
  const width = labelW + plotW + valueW;
  const height = padTop + data.length * band + padBottom;

  const { max, ticks } = niceTicks(Math.max(...data.map((d) => d.value), 1));
  const x = (v: number) => labelW + (v / max) * plotW;

  const grid = ticks
    .map(
      (t) =>
        `<line ${alone ? INK.grid : 'class="grid"'} x1="${fmt1(x(t))}" y1="${
          padTop - 8
        }" x2="${fmt1(x(t))}" y2="${padTop + data.length * band}"/>`,
    )
    .join("");

  const axis = ticks
    .map(
      (t) =>
        `<text ${alone ? INK.tick : 'class="tick"'} x="${fmt1(x(t))}" y="${
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
      const valueText = `${fmtScore(d.value)}${suffix}`;
      const inside = w >= textWidth(valueText, 19) + 24;
      const value = inside
        ? // 参照元と同じく棒の中央に置く
          `<text ${
            alone ? INK.valueInside : 'class="bar-value inside"'
          } x="${fmt1(
            labelW + w / 2,
          )}" y="${cy}" text-anchor="middle" dominant-baseline="central">${valueText}</text>`
        : `<text ${alone ? INK.valueOutside : 'class="bar-value"'} x="${fmt1(
            labelW + w + 9,
          )}" y="${cy}" dominant-baseline="central">${valueText}</text>`;
      const body = `${brandMarkSvg(d.creator, iconX, cy - ICON / 2, ICON, alone)}
  <text ${alone ? INK.label : 'class="bar-label"'} x="${textRight}" y="${
        cy
      }" text-anchor="end" dominant-baseline="central">${esc(d.label)}${mark}</text>
  <path ${alone ? "" : 'class="bar" '}fill="${d.color}" d="${roundedBar(
        labelW,
        y,
        w,
        barH,
      )}"/>
  ${value}`;
      if (alone) return `<g>\n  ${body}\n</g>`;
      // ページ側は行ぜんたいをリンクにする（ラベルでも棒でもクリックできる）
      return `<a class="bar-row" href="${esc(
        d.href,
      )}" target="_blank" rel="noopener" data-tip="${esc(d.detail)}">
  <rect class="bar-hit" x="0" y="${padTop + i * band}" width="${width}" height="${band}"/>
  ${body}
</a>`;
    })
    .join("\n");

  if (alone) {
    const pad = 18;
    // 見出しを入れるぶんだけ上を空ける（ページ側は h2 があるので不要）
    const titleH = opts.title ? 40 : 0;
    const totalW = width + pad * 2;
    const totalH = height + pad * 2 + titleH;
    const title = opts.title
      ? `  <text ${INK.title} x="${pad + 76}" y="${pad + 32}">${esc(opts.title)}</text>\n`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" font-family="system-ui, -apple-system, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif" role="img">
  <rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#fcfcfb" stroke="#e5e4de"/>
${title}  <g transform="translate(${pad} ${pad + titleH})">
${grid}
${axis}
${watermark(labelW + plotW - 14, padTop + data.length * band - 12, true)}
${bars}
  </g>
</svg>
`;
  }

  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
${grid}
${axis}
${watermark(labelW + plotW - 14, padTop + data.length * band - 12)}
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

export function overallBarChart(
  models: ModelRow[],
  opts: OverallBarChartOptions = {},
): string {
  const hiddenModelIds = new Set(opts.hiddenModelIds ?? []);
  return barChart(
    models.filter((m) => !hiddenModelIds.has(m.id)).map((m) => ({
      label: m.label,
      value: m.score,
      href: m.githubUrl,
      color: creatorColor(m.creator),
      creator: m.creator,
      detail: `${m.label}（${m.creator}） — ${fmtScore(m.score)}点 / ${m.cells.size}問平均`,
      incomplete: !m.complete,
    })),
    opts,
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
  // 点の来ない右上にライン見本つきのキーを置く
  const keyY = pad.top + 14;
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
    [front.map((m) => ({ x: x(m.costPerTask), y: y(m.score) }))],
  );

  const dots = pts
    .map((m) => {
      const cx = x(m.costPerTask);
      const cy = y(m.score);
      const onFront = front.includes(m);
      const lab = placed.get(m.id)!;
      // ラベルを点の真横から動かしたときだけ引き出し線を足す
      const leader =
        Math.abs(lab.y - cy) > 1 || Math.abs(Math.abs(lab.x - cx) - 12) > 1
          ? `<line class="leader" x1="${fmt1(cx)}" y1="${fmt1(cy)}" x2="${fmt1(
              lab.anchor === "start" ? lab.x - 4 : lab.x + 4,
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
      )}" cy="${fmt1(cy)}" r="${onFront ? 9 : 8}"/>
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
${watermark(pad.left + plotW - 16, pad.top + plotH - 12)}
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
 *
 * - 全部の点とパレート線を最初から障害物として登録しておく
 *   （後から置かれる点の上にラベルがかぶらないように）
 * - 候補は点の左右に、近い順で縦横にずらした位置を並べる
 * - どこにも空きがなければ、重なりが一番小さい候補を選ぶ
 */
function placeLabels(
  items: { key: string; cx: number; cy: number; text: string }[],
  bounds: { left: number; right: number; top: number; bottom: number },
  lines: { x: number; y: number }[][] = [],
): Map<string, LabelSpot> {
  type Rect = { x1: number; y1: number; x2: number; y2: number };
  const H = 14;
  const GAP = 12;
  const DOT = 10;
  const taken: Rect[] = [];
  const out = new Map<string, LabelSpot>();

  for (const it of items) {
    taken.push({ x1: it.cx - DOT, y1: it.cy - DOT, x2: it.cx + DOT, y2: it.cy + DOT });
  }
  // 線は細かい矩形の列として扱う
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 0; k <= n; k++) {
        const px = a.x + ((b.x - a.x) * k) / n;
        const py = a.y + ((b.y - a.y) * k) / n;
        taken.push({ x1: px - 1.5, y1: py - 1.5, x2: px + 1.5, y2: py + 1.5 });
      }
    }
  }

  const overlapArea = (r: Rect) => {
    let a = 0;
    for (const t of taken) {
      const w = Math.min(r.x2, t.x2) - Math.max(r.x1, t.x1);
      const h = Math.min(r.y2, t.y2) - Math.max(r.y1, t.y1);
      if (w > 0 && h > 0) a += w * h;
    }
    return a;
  };

  // 近い順に並べた候補のずらし量
  const offsets: { dx: number; dy: number }[] = [];
  for (const dx of [0, 16, 36, 60]) {
    for (const dy of [0, -14, 14, -28, 28, -42, 42]) offsets.push({ dx, dy });
  }
  offsets.sort((a, b) => Math.hypot(a.dx, a.dy * 1.4) - Math.hypot(b.dx, b.dy * 1.4));

  // 上の点から順に置くと、上位モデルが素直な位置を取れる
  const order = [...items].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  for (const it of order) {
    const w = textWidth(it.text);
    let best: { spot: LabelSpot; rect: Rect; cost: number } | null = null;

    for (const { dx, dy } of offsets) {
      for (const anchor of ["start", "end"] as const) {
        const x = anchor === "start" ? it.cx + GAP + dx : it.cx - GAP - dx;
        const y = it.cy + dy;
        const x1 = anchor === "start" ? x : x - w;
        const rect = { x1, y1: y - H / 2, x2: x1 + w, y2: y + H / 2 };
        if (rect.x1 < bounds.left - 4 || rect.x2 > bounds.right + 108) continue;
        if (rect.y1 < bounds.top || rect.y2 > bounds.bottom) continue;
        // 重なり優先、同じなら近い方（候補の並び順）
        const cost = overlapArea(rect);
        if (!best || cost < best.cost) best = { spot: { x, y, anchor }, rect, cost };
        if (cost === 0) break;
      }
      if (best && best.cost === 0) break;
    }

    const chosen = best ?? {
      spot: { x: it.cx + GAP, y: it.cy, anchor: "start" as const },
      rect: { x1: it.cx + GAP, y1: it.cy - H / 2, x2: it.cx + GAP + w, y2: it.cy + H / 2 },
      cost: 0,
    };
    taken.push(chosen.rect);
    out.set(it.key, chosen.spot);
  }

  return out;
}
