export type AdapterName = "codex" | "claude" | "agy" | "openai-compatible";

export interface Problem {
  id: string;
  title: string;
  prompt: string;
}

export interface RunnerConfig {
  id: string;
  adapter: AdapterName;
  model: string;
  request_model?: string;
  reasoning_effort: string;
  timeout_seconds?: number;
  endpoint?: string;
  api_key_env?: string;
  provider?: string;
}

export interface BenchmarkConfig {
  version: number;
  runners: RunnerConfig[];
}

export interface Answer {
  version: number;
  problem_id: string;
  model: string;
  agent: AdapterName;
  reasoning_effort?: string;
  generated_at: string;
  response: string;
}

export interface Evaluation {
  score: number;
  comment: string;
  evaluated_at: string;
}

export interface EvaluatedResult extends Answer, Evaluation {}

export type Result = Answer | EvaluatedResult;

export interface AnswerEntry {
  answerRef: string;
  problem: Problem;
  answer: Answer;
}
