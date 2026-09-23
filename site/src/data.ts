import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export const REPO_URL = "https://github.com/yayugu/hito-bench";
/** 総合スコアの見出し。ページと README 用 SVG で共有する */
export const OVERALL_TITLE = "日本語能力 スコア";
export const REPO_BLOB = `${REPO_URL}/blob/main`;

export interface ProblemMeta {
  id: string;
  title: string;
  githubUrl: string;
}

export interface PriceEntry {
  id: string;
  label: string;
  creator: string;
  price_source: "anthropic" | "openai" | "google" | "openrouter";
  source_url: string;
  openrouter_slug?: string;
  openrouter_provider?: string;
  input: number;
  output: number;
  note?: string;
}

export interface ChartConfig {
  version: number;
  fetched_at: string;
  token_estimate: {
    ascii_chars_per_token: number;
    wide_tokens_per_char: number;
    includes_reasoning: boolean;
  };
  models: PriceEntry[];
  overall: {
    hidden_model_ids: string[];
  };
}

export interface Cell {
  problemId: string;
  score: number;
  /** 推定コスト (USD) — この回答1件ぶん */
  cost: number;
  githubUrl: string;
}

export interface ModelRow {
  id: string;
  label: string;
  creator: string;
  price: PriceEntry;
  cells: Map<string, Cell>;
  /** 採点済みの問題での平均点 */
  score: number;
  /** 1問あたりの推定コスト (USD) */
  costPerTask: number;
  /** 全問そろっているか */
  complete: boolean;
  githubUrl: string;
}

export interface Dataset {
  problems: ProblemMeta[];
  models: ModelRow[];
  charts: ChartConfig;
  generatedAt: string;
}

/**
 * トークン数をテキストから推定する。実行時のトークン数はログに残していないので、
 * ASCII は N 文字 / token、それ以外（日本語など）は 1 文字 = M token として数える。
 */
export function estimateTokens(
  text: string,
  cfg: ChartConfig["token_estimate"],
): number {
  let ascii = 0;
  let wide = 0;
  for (const ch of text) {
    if (ch.codePointAt(0)! < 128) ascii += 1;
    else wide += 1;
  }
  return ascii / cfg.ascii_chars_per_token + wide * cfg.wide_tokens_per_char;
}

function readYaml<T>(path: string): T {
  return YAML.parse(readFileSync(path, "utf8")) as T;
}

export function loadDataset(root: string): Dataset {
  const charts = readYaml<ChartConfig>(join(root, "site", "charts.yaml"));
  if (
    !Array.isArray(charts?.overall?.hidden_model_ids) ||
    !charts.overall.hidden_model_ids.every((id) => typeof id === "string")
  ) {
    throw new Error(
      "site/charts.yaml: overall.hidden_model_ids はモデル ID の配列にしてください",
    );
  }
  const priceById = new Map(charts.models.map((m) => [m.id, m]));

  const problemsDir = join(root, "problems");
  const promptById = new Map<string, string>();
  const problems: ProblemMeta[] = readdirSync(problemsDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const raw = readYaml<{ id: string; title: string; prompt: string }>(
        join(problemsDir, f),
      );
      promptById.set(raw.id, raw.prompt ?? "");
      return {
        id: raw.id,
        title: raw.title,
        githubUrl: `${REPO_BLOB}/problems/${f}`,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const resultsDir = join(root, "results");
  const models: ModelRow[] = [];

  for (const dir of readdirSync(resultsDir).sort()) {
    const modelDir = join(resultsDir, dir);
    const price = priceById.get(dir);
    if (!price) {
      console.warn(
        `[skip] results/${dir}: site/charts.yaml に価格エントリがありません`,
      );
      continue;
    }

    const cells = new Map<string, Cell>();
    let costTotal = 0;
    let scoreTotal = 0;

    for (const problem of problems) {
      const file = join(modelDir, `${problem.id}.yaml`);
      if (!existsSync(file)) continue;
      const raw = readYaml<{ score?: number; response?: string }>(file);
      if (typeof raw.score !== "number") continue;

      const inTokens = estimateTokens(
        promptById.get(problem.id) ?? "",
        charts.token_estimate,
      );
      const outTokens = estimateTokens(
        raw.response ?? "",
        charts.token_estimate,
      );
      const cost =
        (inTokens * price.input + outTokens * price.output) / 1_000_000;

      cells.set(problem.id, {
        problemId: problem.id,
        score: raw.score,
        cost,
        githubUrl: `${REPO_BLOB}/results/${dir}/${problem.id}.yaml`,
      });
      costTotal += cost;
      scoreTotal += raw.score;
    }

    if (cells.size === 0) continue;

    models.push({
      id: dir,
      label: price.label,
      creator: price.creator,
      price,
      cells,
      score: scoreTotal / cells.size,
      costPerTask: costTotal / cells.size,
      complete: cells.size === problems.length,
      githubUrl: `${REPO_URL}/tree/main/results/${dir}`,
    });
  }

  models.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return {
    problems,
    models,
    charts,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * パレート最前線（他に「安くて高得点」なモデルが存在しないモデル）を、
 * コストの安い順に返す。
 */
export function paretoFrontier(models: ModelRow[]): ModelRow[] {
  const byCost = [...models].sort(
    (a, b) => a.costPerTask - b.costPerTask || b.score - a.score,
  );
  const front: ModelRow[] = [];
  let best = -Infinity;
  for (const m of byCost) {
    if (m.score > best) {
      front.push(m);
      best = m.score;
    }
  }
  return front;
}
