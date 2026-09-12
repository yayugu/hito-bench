import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { stringify } from "yaml";
import { invokeRunner } from "./adapters";
import { loadConfig, loadProblems } from "./config";
import type { Answer } from "./types";

interface Options {
  config: string;
  runnerIds: Set<string>;
  problemIds: Set<string>;
  force: boolean;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    config: "benchmark.yaml",
    runnerIds: new Set(),
    problemIds: new Set(),
    force: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--runner" && args[index + 1]) options.runnerIds.add(args[++index]);
    else if (arg === "--problem" && args[index + 1]) options.problemIds.add(args[++index]);
    else if (arg === "--config" && args[index + 1]) options.config = args[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run generate [options]\n\n  --runner ID   Run one runner (repeatable)\n  --problem ID  Run one problem (repeatable)\n  --force       Replace existing results\n  --config FILE Config path (default: benchmark.yaml)`);
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
        ...(runner.adapter === "openai-compatible" ? {} : { agent: runner.adapter }),
        reasoning_effort: runner.reasoning_effort,
        generated_at: new Date().toISOString(),
        response,
      };
      await Bun.write(outputPath, stringify(answer, { lineWidth: 0, blockQuote: "literal" }));
      console.log(`save  ${outputPath}`);
    } catch (error) {
      failures += 1;
      console.error(`fail  ${runner.id} / ${problem.id}\n${error instanceof Error ? error.message : error}`);
    }
  }
}

if (failures > 0) process.exit(1);
