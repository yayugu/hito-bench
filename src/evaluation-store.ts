import { mkdir, readdir, rename } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { stringify } from "yaml";
import { isEvaluated, loadProblems, loadResult } from "./config";
import type { AnswerEntry, EvaluatedResult } from "./types";

interface BlindItem {
  token: string;
  problem: { title: string; prompt: string };
  response: string;
  progress: { completed: number; total: number };
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export class EvaluationStore {
  private readonly entriesByToken = new Map<string, AnswerEntry>();
  private readonly tokenByClient = new Map<string, string>();
  private readonly completedRefs = new Set<string>();
  private readonly loadedRefs = new Set<string>();
  private queue: string[] = [];
  private total = 0;
  private refreshPromise: Promise<void> | null = null;

  private constructor(
    private readonly resultsDirectory: string,
    private readonly problemById: Map<string, AnswerEntry["problem"]>,
  ) {}

  static async create(root: string): Promise<EvaluationStore> {
    const resultsDirectory = join(root, "results");
    const problems = await loadProblems(join(root, "problems"));
    const store = new EvaluationStore(
      resultsDirectory,
      new Map(problems.map((problem) => [problem.id, problem])),
    );
    await mkdir(store.resultsDirectory, { recursive: true });
    await store.refresh();
    return store;
  }

  private async scanResults(): Promise<void> {
    const runnerDirectories = await readdir(this.resultsDirectory, { withFileTypes: true });
    const newTokens: string[] = [];
    for (const directory of runnerDirectories.filter((entry) => entry.isDirectory())) {
      const directoryPath = join(this.resultsDirectory, directory.name);
      const files = (await readdir(directoryPath)).filter((name) => /\.ya?ml$/i.test(name)).sort();
      for (const file of files) {
        const path = join(directoryPath, file);
        const answerRef = relative(this.resultsDirectory, path);
        if (this.loadedRefs.has(answerRef)) continue;
        const answer = await loadResult(path);
        const problem = this.problemById.get(answer.problem_id);
        if (!problem) throw new Error(`${path}: unknown problem ${answer.problem_id}`);
        if (basename(file).replace(/\.ya?ml$/i, "") !== answer.problem_id) {
          throw new Error(`${path}: problem_id must match filename`);
        }
        this.loadedRefs.add(answerRef);
        if (isEvaluated(answer)) {
          this.completedRefs.add(answerRef);
          continue;
        }
        const token = crypto.randomUUID();
        this.entriesByToken.set(token, { answerRef, answer, problem });
        newTokens.push(token);
      }
    }

    if (newTokens.length > 0) {
      const groupedTokens = new Map<string, string[]>();
      for (const token of [...this.queue, ...newTokens]) {
        const problemId = this.entriesByToken.get(token)!.problem.id;
        const group = groupedTokens.get(problemId) ?? [];
        group.push(token);
        groupedTokens.set(problemId, group);
      }
      this.queue = [...groupedTokens.keys()]
        .sort()
        .flatMap((problemId) => shuffle(groupedTokens.get(problemId)!));
    }
    this.total = this.completedRefs.size + this.entriesByToken.size;
  }

  private async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.scanResults().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async next(clientId: string): Promise<BlindItem | null> {
    await this.refresh();
    const existing = this.tokenByClient.get(clientId);
    const token = existing && this.entriesByToken.has(existing) ? existing : this.queue.shift();
    if (!token) return null;
    this.tokenByClient.set(clientId, token);
    const entry = this.entriesByToken.get(token)!;
    return {
      token,
      problem: { title: entry.problem.title, prompt: entry.problem.prompt },
      response: entry.answer.response,
      progress: { completed: this.completedRefs.size, total: this.total },
    };
  }

  async submit(clientId: string, token: string, score: number, comment: string): Promise<void> {
    const entry = this.entriesByToken.get(token);
    if (!entry || this.tokenByClient.get(clientId) !== token) {
      throw new Error("This evaluation item is no longer available");
    }
    if (!Number.isFinite(score)) throw new Error("Score must be a finite number");
    if (comment.length > 20_000) throw new Error("Comment is too long");

    const { response, ...answer } = entry.answer;
    const result: EvaluatedResult = {
      ...answer,
      score,
      comment,
      evaluated_at: new Date().toISOString(),
      response,
    };
    const file = basename(entry.answerRef);
    const resultDirectory = join(this.resultsDirectory, dirname(entry.answerRef));
    const finalPath = join(resultDirectory, file);
    const temporaryPath = join(resultDirectory, `.${file}.tmp`);
    await Bun.write(temporaryPath, stringify(result, { lineWidth: 0, blockQuote: "literal" }));
    await rename(temporaryPath, finalPath);

    this.completedRefs.add(entry.answerRef);
    this.entriesByToken.delete(token);
    this.tokenByClient.delete(clientId);
  }
}
