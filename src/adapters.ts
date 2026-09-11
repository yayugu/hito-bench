import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RunnerConfig } from "./types";

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runProcess(
  command: string[],
  cwd: string,
  timeoutMs: number,
  stdin?: string,
): Promise<ProcessResult> {
  const process = Bun.spawn(command, {
    cwd,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...globalThis.process.env, NO_COLOR: "1" },
  });
  const timer = setTimeout(() => process.kill(), timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timer);
  }
}

function processError(runner: RunnerConfig, result: ProcessResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || "no diagnostic output";
  return new Error(`${runner.id} exited with ${result.exitCode}: ${detail}`);
}

export function extractOpenAICompatibleText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("REST response is not an object");
  const value = payload as Record<string, any>;
  if (typeof value.output_text === "string" && value.output_text.trim()) return value.output_text;

  const content = value.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => (typeof part === "string" ? part : part?.text))
      .filter((part: unknown): part is string => typeof part === "string")
      .join("");
    if (text.trim()) return text;
  }
  throw new Error("REST response did not contain choices[0].message.content or output_text");
}

async function runRest(runner: RunnerConfig, prompt: string, timeoutMs: number): Promise<string> {
  if (!runner.endpoint) throw new Error(`${runner.id}: endpoint is not configured`);
  const apiKey = runner.api_key_env ? process.env[runner.api_key_env] : undefined;
  if (runner.api_key_env && !apiKey) {
    throw new Error(`${runner.id}: environment variable ${runner.api_key_env} is not set`);
  }

  const headers = new Headers({ "content-type": "application/json" });
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  const response = await fetch(runner.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: runner.model,
      reasoning_effort: runner.reasoning_effort,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${runner.id}: REST ${response.status}: ${body.slice(0, 1000)}`);
  try {
    return extractOpenAICompatibleText(JSON.parse(body));
  } catch (error) {
    throw new Error(`${runner.id}: ${error instanceof Error ? error.message : error}`);
  }
}

export async function invokeRunner(
  runner: RunnerConfig,
  prompt: string,
  workspaceRoot: string,
): Promise<string> {
  const timeoutMs = (runner.timeout_seconds ?? 600) * 1000;
  if (runner.adapter === "openai-compatible") return (await runRest(runner, prompt, timeoutMs)).trim();

  const workspace = await mkdtemp(join(workspaceRoot, `${runner.adapter}-`));
  try {
    if (runner.adapter === "codex") {
      const outputPath = join(workspace, "final.txt");
      const result = await runProcess(
        [
          "codex",
          "exec",
          "--model",
          runner.model,
          "--config",
          `model_reasoning_effort=${JSON.stringify(runner.reasoning_effort)}`,
          "--sandbox",
          "read-only",
          "--ephemeral",
          "--skip-git-repo-check",
          "--color",
          "never",
          "--output-last-message",
          outputPath,
          "-",
        ],
        workspace,
        timeoutMs,
        prompt,
      );
      if (result.exitCode !== 0) throw processError(runner, result);
      const answer = await Bun.file(outputPath).text();
      if (!answer.trim()) throw new Error(`${runner.id}: Codex returned an empty response`);
      return answer.trim();
    }

    if (runner.adapter === "claude") {
      const result = await runProcess(
        [
          "claude",
          "--model",
          runner.model,
          "--effort",
          runner.reasoning_effort,
          "--print",
          "--tools",
          "",
          "--no-session-persistence",
          "--output-format",
          "text",
          prompt,
        ],
        workspace,
        timeoutMs,
      );
      if (result.exitCode !== 0) throw processError(runner, result);
      if (!result.stdout.trim()) throw new Error(`${runner.id}: Claude returned an empty response`);
      return result.stdout.trim();
    }

    const result = await runProcess(
      [
        "agy",
        "--model",
        runner.model,
        "--effort",
        runner.reasoning_effort,
        "--disable-slash-commands",
        "--sandbox",
        `--print=${prompt}`,
      ],
      workspace,
      timeoutMs,
    );
    if (result.exitCode !== 0) throw processError(runner, result);
    if (!result.stdout.trim()) throw new Error(`${runner.id}: Agy returned an empty response`);
    return result.stdout.trim();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
