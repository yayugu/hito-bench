/**
 * LLM as Judge の CLI。本体は src/judge.ts。
 *
 * 入力: llm-judge/rubrics/<problem>.yaml        … 判定項目と配点（基準本文は problems/<problem>.yaml の kijun）
 * 出力: llm-judge/verdicts/<problem>/<runner>.yaml … 判定の詳細（引用・理由・水準）
 *       results/<runner>/<problem>.yaml           … score / comment / evaluated_at を上書き
 */
import { resolve } from "node:path";
import { JUDGE_EFFORT, JUDGE_MODEL, runLlmJudge, type JudgeOptions } from "./judge";

function parseArgs(args: string[]): JudgeOptions {
  const options: JudgeOptions = {
    problemIds: new Set(),
    runnerIds: new Set(),
    runs: 1,
    concurrency: 4,
    force: false,
    rescoreOnly: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--force") options.force = true;
    else if (arg === "--rescore-only") options.rescoreOnly = true;
    else if (arg === "--problem" && next) options.problemIds.add(args[++index]);
    else if (arg === "--runner" && next) options.runnerIds.add(args[++index]);
    else if (arg === "--runs" && next) options.runs = Math.max(1, Number(args[++index]));
    else if (arg === "--concurrency" && next) options.concurrency = Math.max(1, Number(args[++index]));
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run llm-judge [options]

判定モデル: ${JUDGE_MODEL}（reasoning effort: ${JUDGE_EFFORT}）

  --problem ID      採点する問題（繰り返し可。既定: llm-judge/rubrics/ に配点表がある全問題）
  --runner ID       採点する回答のランナー（繰り返し可。既定: 全部）
  --runs N          同じ回答を N 回判定して項目ごとに多数決（既定: 1）
  --concurrency N   同時リクエスト数（既定: 4）
  --force           基準・判定項目が変わっていなくても再判定する
  --rescore-only    API を呼ばず、保存済みの判定から点数だけ計算し直す

基準（kijun）や判定項目の文面が変わったときだけ API で再判定する。
水準の点数や減点幅など点数換算だけの変更は、保存済みの判定から再計算する（API は呼ばない）。`);
      process.exit(0);
    } else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!Number.isInteger(options.runs) || !Number.isInteger(options.concurrency)) {
    throw new Error("--runs と --concurrency は整数で指定してください");
  }
  return options;
}

const root = resolve(import.meta.dir, "..");
const { failures } = await runLlmJudge(root, parseArgs(process.argv.slice(2)));
if (failures > 0) process.exit(1);
