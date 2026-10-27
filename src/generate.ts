import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { stringify } from "yaml";
import { invokeRunner } from "./adapters";
import { loadConfig, loadProblems } from "./config";
import { judgedProblemIds, runLlmJudge } from "./judge";
import type { Answer } from "./types";

interface Options {
  config: string;
  runnerIds: Set<string>;
  problemIds: Set<string>;
  force: boolean;
  judge: boolean;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    config: "benchmark.yaml",
    runnerIds: new Set(),
    problemIds: new Set(),
    force: false,
    judge: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--no-judge") options.judge = false;
    else if (arg === "--runner" && args[index + 1]) options.runnerIds.add(args[++index]);
    else if (arg === "--problem" && args[index + 1]) options.problemIds.add(args[++index]);
    else if (arg === "--config" && args[index + 1]) options.config = args[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run generate [options]\n\n  --runner ID   Run one runner (repeatable)\n  --problem ID  Run one problem (repeatable)\n  --force       Replace existing results\n  --no-judge    Do not run LLM as Judge on newly generated results\n  --config FILE Config path (default: benchmark.yaml)\n\nNewly generated answers to problems with a rubric in llm-judge/rubrics/ are judged right after generation.`);
      process.exit(0);
    } else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  return options;
}

const root = resolve(import.meta.dir, "..");
const options = parseArgs(process.argv.slice(2));
const config = await loadConfig(resolve(root, options.config));
const allProblems = await loadProblems(join(root, "problems"));
const runners = config.runners.filter(
  (runner) => options.runnerIds.size === 0 || options.runnerIds.has(runner.id),
);
const problems = allProblems.filter((problem) =>
  options.problemIds.size > 0 ? options.problemIds.has(problem.id) : true,
);

for (const id of options.runnerIds) {
  if (!config.runners.some((runner) => runner.id === id)) throw new Error(`Unknown runner: ${id}`);
}
for (const id of options.problemIds) {
  if (!allProblems.some((problem) => problem.id === id)) throw new Error(`Unknown problem: ${id}`);
}
if (runners.length === 0) throw new Error("No runners selected");
if (problems.length === 0) throw new Error("No problems selected");

const workspaceRoot = join(root, ".hito-bench", "workspaces");
await mkdir(workspaceRoot, { recursive: true });

const judgeProblems = await judgedProblemIds(root);
/** 今回生成した回答のうち LLM as Judge で採点するもの（`${runnerId}/${problemId}`） */
const toJudge = new Set<string>();

let failures = 0;
for (const runner of runners) {
  const resultDirectory = join(root, "results", runner.id);
  await mkdir(resultDirectory, { recursive: true });
  for (const problem of problems) {
    const outputPath = join(resultDirectory, `${problem.id}.yaml`);
    if (!options.force && (await Bun.file(outputPath).exists())) {
      console.log(`skip  ${runner.id} / ${problem.id} (already exists)`);
      continue;
    }

    console.log(`run   ${runner.id} / ${problem.id}`);
    try {
      const response = await invokeRunner(runner, problem.prompt, workspaceRoot);
      const answer: Answer = {
        version: 1,
        problem_id: problem.id,
        model: runner.model,
        // API 直呼び（openai-compatible / codex-api）は agent を記録しない
        ...(runner.adapter === "claude" || runner.adapter === "agy" ? { agent: runner.adapter } : {}),
        reasoning_effort: runner.reasoning_effort,
        generated_at: new Date().toISOString(),
        response,
      };
      await Bun.write(outputPath, stringify(answer, { lineWidth: 0, blockQuote: "literal" }));
      console.log(`save  ${outputPath}`);
      if (judgeProblems.has(problem.id)) toJudge.add(`${runner.id}/${problem.id}`);
    } catch (error) {
      failures += 1;
      console.error(`fail  ${runner.id} / ${problem.id}\n${error instanceof Error ? error.message : error}`);
    }
  }
}

if (options.judge && toJudge.size > 0) {
  console.log(`judge ${toJudge.size} new answer(s) with LLM as Judge`);
  const judged = await runLlmJudge(root, {
    problemIds: new Set([...toJudge].map((key) => key.split("/")[1])),
    runnerIds: new Set([...toJudge].map((key) => key.split("/")[0])),
    only: toJudge,
    runs: 1,
    concurrency: 4,
    // 新しく生成した回答なので、同じランナーの古い判定が残っていても必ず判定し直す
    force: true,
    rescoreOnly: false,
  });
  failures += judged.failures;
}

if (failures > 0) process.exit(1);
