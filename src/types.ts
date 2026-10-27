export type AdapterName = "codex-api" | "claude" | "agy" | "openai-compatible";

/** results に記録されるエージェント名。"codex" は削除済みの Codex CLI アダプタで生成した過去の結果 */
export type AgentName = "codex" | "claude" | "agy";

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
  agent?: AgentName;
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
