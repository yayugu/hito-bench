import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse } from "yaml";
import type {
  AdapterName,
  Answer,
  BenchmarkConfig,
  EvaluatedResult,
  Problem,
  Result,
  RunnerConfig,
} from "./types";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ADAPTERS = new Set<AdapterName>([
  "codex",
  "claude",
  "agy",
  "openai-compatible",
]);
const REASONING_EFFORTS: Partial<Record<AdapterName, Set<string>>> = {
  codex: new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]),
  claude: new Set(["low", "medium", "high", "xhigh", "max"]),
  agy: new Set(["low", "medium", "high"]),
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function safeId(value: unknown, label: string): string {
  const id = string(value, label);
  if (!SAFE_ID.test(id)) {
    throw new Error(`${label} may contain only letters, numbers, dot, dash, and underscore`);
  }
  return id;
}

function reasoningEffort(value: unknown, adapter: AdapterName, label: string): string {
  const effort = string(value, label);
  const supported = REASONING_EFFORTS[adapter];
  if (supported && !supported.has(effort)) {
    throw new Error(`${label} must be one of ${[...supported].join(", ")} for adapter ${adapter}`);
  }
  return effort;
}

async function parseYamlFile(path: string): Promise<unknown> {
  try {
    return parse(await Bun.file(path).text());
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

function expandEnvironment(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    return process.env[name] ?? "";
  });
}

export async function loadConfig(path: string): Promise<BenchmarkConfig> {
  const raw = object(await parseYamlFile(path), path);
  if (raw.version !== 1) throw new Error(`${path}: version must be 1`);
  if (!Array.isArray(raw.runners) || raw.runners.length === 0) {
    throw new Error(`${path}: runners must be a non-empty list`);
  }

  const runners: RunnerConfig[] = raw.runners.map((item, index) => {
    const value = object(item, `${path}: runners[${index}]`);
    const adapter = string(value.adapter, `runners[${index}].adapter`) as AdapterName;
    if (!ADAPTERS.has(adapter)) throw new Error(`Unknown adapter: ${adapter}`);

    const runner: RunnerConfig = {
      id: safeId(value.id, `runners[${index}].id`),
      adapter,
      model: string(value.model, `runners[${index}].model`),
      reasoning_effort: reasoningEffort(
        value.reasoning_effort,
        adapter,
        `runners[${index}].reasoning_effort`,
      ),
    };
    if (value.timeout_seconds !== undefined) {
      const timeout = Number(value.timeout_seconds);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error(`runners[${index}].timeout_seconds must be positive`);
      }
      runner.timeout_seconds = timeout;
    }
    if (typeof value.endpoint === "string") runner.endpoint = expandEnvironment(value.endpoint);
    if (typeof value.api_key_env === "string") runner.api_key_env = value.api_key_env;
    if (typeof value.request_model === "string") {
      runner.request_model = string(value.request_model, `runners[${index}].request_model`);
    }
    if (typeof value.provider === "string") {
      runner.provider = string(value.provider, `runners[${index}].provider`);
    }
    return runner;
  });

  const ids = new Set<string>();
  for (const runner of runners) {
    if (ids.has(runner.id)) throw new Error(`Duplicate runner id: ${runner.id}`);
    ids.add(runner.id);
    if (runner.adapter === "openai-compatible" && !runner.endpoint) {
      throw new Error(`${runner.id}: endpoint is required`);
    }
  }
  return { version: 1, runners };
}

export async function loadProblems(directory: string): Promise<Problem[]> {
  const names = (await readdir(directory)).filter((name) => /\.ya?ml$/i.test(name)).sort();
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const name of names) {
    const path = join(directory, name);
    const raw = object(await parseYamlFile(path), path);
    const problem: Problem = {
      id: safeId(raw.id, `${path}: id`),
      title: string(raw.title, `${path}: title`),
      prompt: string(raw.prompt, `${path}: prompt`),
    };
    const expected = basename(name).replace(/\.ya?ml$/i, "");
    if (problem.id !== expected) throw new Error(`${path}: id must match filename (${expected})`);
    if (ids.has(problem.id)) throw new Error(`Duplicate problem id: ${problem.id}`);
    ids.add(problem.id);
    problems.push(problem);
  }
  return problems;
}

export async function loadResult(path: string): Promise<Result> {
  const raw = object(await parseYamlFile(path), path);
  const adapter = string(raw.agent, `${path}: agent`) as AdapterName;
  if (!ADAPTERS.has(adapter)) throw new Error(`${path}: unknown agent ${adapter}`);
  const answer: Answer = {
    version: Number(raw.version),
    problem_id: safeId(raw.problem_id, `${path}: problem_id`),
    model: string(raw.model, `${path}: model`),
    agent: adapter,
    ...(raw.reasoning_effort === undefined
      ? {}
      : { reasoning_effort: string(raw.reasoning_effort, `${path}: reasoning_effort`) }),
    generated_at: string(raw.generated_at, `${path}: generated_at`),
    response: string(raw.response, `${path}: response`),
  };

  const evaluationFields = [raw.score, raw.comment, raw.evaluated_at];
  const hasEvaluation = evaluationFields.some((value) => value !== undefined);
  if (!hasEvaluation) return answer;
  if (evaluationFields.some((value) => value === undefined)) {
    throw new Error(`${path}: score, comment, and evaluated_at must be specified together`);
  }
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
    throw new Error(`${path}: score must be a finite number`);
  }
  if (typeof raw.comment !== "string") throw new Error(`${path}: comment must be a string`);

  return {
    ...answer,
    score: raw.score,
    comment: raw.comment,
    evaluated_at: string(raw.evaluated_at, `${path}: evaluated_at`),
  };
}

export function isEvaluated(result: Result): result is EvaluatedResult {
  return "score" in result;
}
