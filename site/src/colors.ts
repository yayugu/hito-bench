/**
 * 会社ごとの色とロゴ。
 *
 * 色: Anthropic / OpenAI / Google はブランドカラー、Alibaba / Tencent / Meta は
 * 空いている色相を割り当て。スコアが振るわない4社（Xiaomi / Z.ai / Moonshot AI /
 * DeepSeek）は目立たせず FALLBACK のグレーにしている。
 *
 * dataviz の validate_palette.js（--pairs all, light）では明度帯・彩度・
 * 白地コントラスト・通常色覚の分離がすべて PASS、CVD 分離だけが 6.0（Meta の紫 ↔
 * Google の青）で 6–8 の floor band に入る。この band は「直接ラベルなどの
 * 二次エンコードがあれば可」なので、棒と点にはすべてモデル名を直接書き、
 * 凡例と全結果の表も併置している。
 */
export const CREATOR_COLORS: Record<string, string> = {
  Anthropic: "#d97757",
  OpenAI: "#10a37f",
  Google: "#3b7ded",
  Alibaba: "#8a6a00",
  Tencent: "#ad2f63",
  Meta: "#a13cc9",
};

/** 色を割り当てていない会社（スコア下位）はこのグレー */
const FALLBACK = "#8f8d85";

export function creatorColor(creator: string): string {
  return CREATOR_COLORS[creator] ?? FALLBACK;
}

/**
 * ロゴは大手三社ぶんだけ。パスは Simple Icons (CC0) の 24x24 viewBox。
 * ロゴ自体は各社の商標で、ここでは各社のモデルを指すための表示に使っている。
 */
const BRAND_PATHS: Record<string, string> = {
  Anthropic:
    "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
  OpenAI:
    "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  Google:
    "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
};

export function hasBrandIcon(creator: string): boolean {
  return creator in BRAND_PATHS;
}

/** ページ先頭に1回だけ置く <symbol> 定義。以降は <use> で参照する */
export function brandSymbols(): string {
  const symbols = Object.entries(BRAND_PATHS)
    .map(
      ([creator, d]) =>
        `<symbol id="${symbolId(creator)}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`,
    )
    .join("");
  return `<svg class="brand-defs" aria-hidden="true" focusable="false"><defs>${symbols}</defs></svg>`;
}

function symbolId(creator: string): string {
  return `brand-${creator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * SVG チャートの中に置くロゴ。ロゴが無い会社は色付きの小さな四角。
 *
 * `inlinePath` を true にすると <use> 参照ではなくパスを直接埋める。
 * README 用の単体 SVG は <symbol> を持たないうえ、GitHub のサニタイズで
 * <use> が落ちる可能性があるため。
 */
export function brandMarkSvg(
  creator: string,
  x: number,
  y: number,
  size: number,
  inlinePath = false,
): string {
  const color = creatorColor(creator);
  if (!hasBrandIcon(creator)) {
    const r = size * 0.22;
    const inset = size * 0.13;
    return `<rect x="${(x + inset).toFixed(1)}" y="${(y + inset).toFixed(1)}" width="${(
      size -
      inset * 2
    ).toFixed(1)}" height="${(size - inset * 2).toFixed(1)}" rx="${r.toFixed(
      1,
    )}" fill="${color}"/>`;
  }
  if (inlinePath) {
    const k = size / 24;
    return `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(
      4,
    )})" fill="${color}" d="${BRAND_PATHS[creator]}"/>`;
  }
  return `<use href="#${symbolId(creator)}" x="${x.toFixed(1)}" y="${y.toFixed(
    1,
  )}" width="${size}" height="${size}" fill="${color}"/>`;
}

/**
 * HTML（凡例・表）の中に置くロゴ。ロゴが無い会社は同じ寸法の角丸四角にして、
 * どちらでもモデル名の左端が揃うようにしている。
 */
export function brandMarkHtml(creator: string, size = 13): string {
  const color = creatorColor(creator);
  const body = hasBrandIcon(creator)
    ? `<use href="#${symbolId(creator)}" fill="${color}"/>`
    : `<rect x="4" y="4" width="16" height="16" rx="4.5" fill="${color}"/>`;
  return `<svg class="brand" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
