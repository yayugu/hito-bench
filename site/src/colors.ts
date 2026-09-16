/**
 * 会社ごとの色。各社のブランドカラーに寄せつつ、10社ぶんの色相をできるだけ
 * 散らしてある（dataviz の validate_palette.js で明度帯・彩度・白地コントラストは
 * 全スロット PASS。10色だと CVD の全ペア分離までは通らないので、
 * 棒・点にはすべてモデル名を直接書き、凡例と表も併置して色だけに頼らせない）。
 */
export const CREATOR_COLORS: Record<string, string> = {
  Xiaomi: "#a4432e",
  Anthropic: "#d97757",
  Alibaba: "#a67c00",
  "Moonshot AI": "#2e7d32",
  OpenAI: "#10a37f",
  Tencent: "#0091b5",
  Google: "#3b7ded",
  DeepSeek: "#6a5be8",
  Meta: "#a34bd1",
  "Z.ai": "#d63a72",
};

const FALLBACK = "#52514e";

export function creatorColor(creator: string): string {
  return CREATOR_COLORS[creator] ?? FALLBACK;
}
