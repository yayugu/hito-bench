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
    const item = await store.next("client");
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
    expect(await restartedStore.next("another-client")).toBeNull();
  });

  test("groups answers by problem and only shuffles within each problem", async () => {
    const root = await mkdtemp(join(tmpdir(), "hito-bench-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "problems"));

    for (const [id, title] of [
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]) {
      await Bun.write(
        join(root, "problems", `${id}.yaml`),
        stringify({ id, title, prompt: `${title} prompt` }),
      );
    }

    for (const runner of ["runner-a", "runner-b"]) {
      await mkdir(join(root, "results", runner), { recursive: true });
      for (const problemId of ["alpha", "beta"]) {
        await Bun.write(
          join(root, "results", runner, `${problemId}.yaml`),
          stringify({
            version: 1,
            problem_id: problemId,
            model: runner,
            agent: "codex",
            generated_at: "2026-01-01T00:00:00.000Z",
            response: `${runner} response`,
          }),
        );
      }
    }

    const store = await EvaluationStore.create(root);
    const titles: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const item = await store.next("client");
      expect(item).not.toBeNull();
      titles.push(item!.problem.title);
      await store.submit("client", item!.token, 80, "");
    }

    expect(titles).toEqual(["Alpha", "Alpha", "Beta", "Beta"]);
  });

  test("discovers results generated after the store starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "hito-bench-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "problems"));
    await Bun.write(
      join(root, "problems", "sample.yaml"),
      stringify({ id: "sample", title: "Sample", prompt: "Write something" }),
    );

    const store = await EvaluationStore.create(root);
    expect(await store.next("client")).toBeNull();

    await mkdir(join(root, "results", "new-runner"));
    await Bun.write(
      join(root, "results", "new-runner", "sample.yaml"),
      stringify({
        version: 1,
        problem_id: "sample",
        model: "new-model",
        agent: "codex",
        generated_at: "2026-01-01T00:00:00.000Z",
        response: "Newly generated response",
      }),
    );

    const item = await store.next("client");
    expect(item?.response).toBe("Newly generated response");
    expect(item?.progress).toEqual({ completed: 0, total: 1 });
  });
});
