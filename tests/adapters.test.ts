import { describe, expect, test } from "bun:test";
import { invokeRunner } from "../src/adapters";
import type { RunnerConfig } from "../src/types";

describe("openai-compatible adapter", () => {
  test("uses the request model and restricts routing to the configured provider", async () => {
    let requestBody: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        requestBody = await request.json();
        return Response.json({ choices: [{ message: { content: "generated text" } }] });
      },
    });
    const runner: RunnerConfig = {
      id: "muse-spark-1.3",
      adapter: "openai-compatible",
      model: "meta/muse-spark-1.3",
      request_model: "meta/muse-spark-1.3-contributor",
      reasoning_effort: "medium",
      endpoint: `http://127.0.0.1:${server.port}`,
      provider: "meta",
    };

    try {
      expect(await invokeRunner(runner, "prompt", ".")).toBe("generated text");
      expect(requestBody).toEqual({
        model: "meta/muse-spark-1.3-contributor",
        reasoning_effort: "medium",
        messages: [{ role: "user", content: "prompt" }],
        provider: { only: ["meta"], allow_fallbacks: false },
      });
    } finally {
      server.stop(true);
    }
  });
});
