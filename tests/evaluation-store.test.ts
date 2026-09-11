import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { EvaluationStore } from "../src/evaluation-store";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("EvaluationStore", () => {
  test("adds an evaluation above the response in the existing result file", async () => {
    const root = await mkdtemp(join(tmpdir(), "hito-bench-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "problems"));
    await mkdir(join(root, "results", "runner"), { recursive: true });

    await Bun.write(
      join(root, "problems", "sample.yaml"),
      stringify({ id: "sample", title: "Sample", prompt: "Write something" }),
    );
    const resultPath = join(root, "results", "runner", "sample.yaml");
    await Bun.write(
      resultPath,
      stringify({
        version: 1,
        problem_id: "sample",
        model: "test-model",
        agent: "codex",
        generated_at: "2026-01-01T00:00:00.000Z",
        response: "A very long response",
      }),
    );

    const store = await EvaluationStore.create(root);
    const item = store.next("client");
    expect(item).not.toBeNull();
    await store.submit("client", item!.token, 85, "Good");

    const text = await Bun.file(resultPath).text();
    expect(text.indexOf("score:")).toBeLessThan(text.indexOf("response:"));
    expect(text.indexOf("comment:")).toBeLessThan(text.indexOf("response:"));
    expect(parse(text)).toMatchObject({
      score: 85,
      comment: "Good",
      response: "A very long response",
    });

    const restartedStore = await EvaluationStore.create(root);
    expect(restartedStore.next("another-client")).toBeNull();
  });
});
