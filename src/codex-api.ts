/**
 * ChatGPT サブスクリプション（Codex 用 OAuth トークン）で Responses API を直接呼ぶクライアント。
 *
 * - 認証情報は $CODEX_HOME/auth.json（既定 ~/.codex/auth.json）を読み取り専用で使う。
 * - アクセストークンの更新（refresh）はしない。refresh token はローテーションするため、
 *   ここで更新すると Codex CLI 側の auth.json と食い違う。期限切れなら Codex を一度起動して更新する。
 */
import { homedir } from "node:os";
import { join } from "node:path";

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

interface CodexAuth {
  accessToken: string;
  accountId: string;
  expiresAt: Date | null;
}

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface CodexRequest {
  model: string;
  reasoningEffort: string;
  instructions: string;
  input: string;
  jsonSchema?: JsonSchemaFormat;
  timeoutMs?: number;
}

export interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
  input_tokens_details?: { cached_tokens?: number };
}

export interface CodexResponse {
  text: string;
  usage: CodexUsage | null;
}

let cachedAuth: CodexAuth | null = null;

async function loadAuth(): Promise<CodexAuth> {
  if (cachedAuth) return cachedAuth;
  const path = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`${path} が見つかりません。Codex で ChatGPT ログインしてください`);
  const raw = (await file.json()) as Record<string, any>;
  const accessToken = raw.tokens?.access_token;
  const accountId = raw.tokens?.account_id;
  if (typeof accessToken !== "string" || typeof accountId !== "string") {
    throw new Error(`${path} に ChatGPT ログインのトークンがありません（auth_mode: ${raw.auth_mode}）`);
  }
  let expiresAt: Date | null = null;
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
    if (typeof payload.exp === "number") expiresAt = new Date(payload.exp * 1000);
  } catch {
    // JWT でなければ期限チェックをしない
  }
  cachedAuth = { accessToken, accountId, expiresAt };
  return cachedAuth;
}

function assertNotExpired(auth: CodexAuth): void {
  if (auth.expiresAt && auth.expiresAt.getTime() < Date.now() + 60_000) {
    throw new Error(
      `Codex のアクセストークンが期限切れです（${auth.expiresAt.toISOString()}）。Codex を一度起動して更新してください`,
    );
  }
}

/** SSE のボディから response.completed を取り出してテキストと usage を返す */
function parseEventStream(body: string): CodexResponse {
  let deltas = "";
  let completed: Record<string, any> | null = null;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") deltas += event.delta;
    else if (event.type === "response.completed") completed = event.response;
    else if (event.type === "response.failed" || event.type === "error") {
      const detail = event.response?.error ?? event.error ?? event;
      throw new Error(`Codex API error: ${JSON.stringify(detail).slice(0, 1000)}`);
    } else if (event.type === "response.incomplete") {
      throw new Error(`Codex API incomplete: ${JSON.stringify(event.response?.incomplete_details)}`);
    }
  }
  if (!completed) throw new Error("Codex API: response.completed が返りませんでした");
  const text =
    (completed.output ?? [])
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .map((part: any) => (typeof part.text === "string" ? part.text : ""))
      .join("") || deltas;
  if (!text.trim()) throw new Error("Codex API: 空の応答です");
  return { text, usage: completed.usage ?? null };
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

export async function callCodex(request: CodexRequest, maxAttempts = 4): Promise<CodexResponse> {
  const auth = await loadAuth();
  assertNotExpired(auth);

  const body = JSON.stringify({
    model: request.model,
    instructions: request.instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: request.input }] }],
    reasoning: { effort: request.reasoningEffort },
    ...(request.jsonSchema
      ? { text: { format: { type: "json_schema", strict: true, ...request.jsonSchema } } }
      : {}),
    store: false,
    stream: true,
  });

  for (let attempt = 1; ; attempt += 1) {
    let retryAfterMs = 2 ** attempt * 2000;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${auth.accessToken}`,
          "chatgpt-account-id": auth.accountId,
          "OpenAI-Beta": "responses=experimental",
          originator: "hito-bench",
        },
        body,
        signal: AbortSignal.timeout(request.timeoutMs ?? 600_000),
      });
      const text = await response.text();
      if (response.ok) return parseEventStream(text);

      const error = new Error(`Codex API ${response.status}: ${text.slice(0, 1000)}`);
      if (!RETRYABLE.has(response.status) || attempt >= maxAttempts) throw error;
      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = retryAfter * 1000;
      console.error(`retry ${attempt}/${maxAttempts - 1}: ${error.message.slice(0, 200)}`);
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const isNetwork = error instanceof TypeError;
      if (!(isTimeout || isNetwork) || attempt >= maxAttempts) throw error;
      console.error(`retry ${attempt}/${maxAttempts - 1}: ${error instanceof Error ? error.message : error}`);
    }
    await Bun.sleep(retryAfterMs);
  }
}
