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
  enabled?: boolean;
  timeout_seconds?: number;
  endpoint?: string;
  api_key_env?: string;
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
  generated_at: string;
  response: string;
}

export interface AnswerEntry {
  answerRef: string;
  problem: Problem;
  answer: Answer;
}

export interface Evaluation {
  version: number;
  problem_id: string;
  score: number;
  comment: string;
  evaluated_at: string;
}
