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
  private queue: string[] = [];
  private total = 0;

  private constructor(private readonly resultsDirectory: string) {}

  static async create(root: string): Promise<EvaluationStore> {
    const store = new EvaluationStore(join(root, "results"));
    await mkdir(store.resultsDirectory, { recursive: true });

    const problems = await loadProblems(join(root, "problems"));
    const problemById = new Map(problems.map((problem) => [problem.id, problem]));
    const runnerDirectories = await readdir(store.resultsDirectory, { withFileTypes: true });
    const entries: AnswerEntry[] = [];
    for (const directory of runnerDirectories.filter((entry) => entry.isDirectory())) {
      const directoryPath = join(store.resultsDirectory, directory.name);
      const files = (await readdir(directoryPath)).filter((name) => /\.ya?ml$/i.test(name)).sort();
      for (const file of files) {
        const path = join(directoryPath, file);
        const answerRef = relative(store.resultsDirectory, path);
        const answer = await loadResult(path);
        const problem = problemById.get(answer.problem_id);
        if (!problem) throw new Error(`${path}: unknown problem ${answer.problem_id}`);
        if (basename(file).replace(/\.ya?ml$/i, "") !== answer.problem_id) {
          throw new Error(`${path}: problem_id must match filename`);
        }
        if (isEvaluated(answer)) {
          store.completedRefs.add(answerRef);
          continue;
        }
        entries.push({ answerRef, answer, problem });
      }
    }

    for (const entry of shuffle(entries)) {
      const token = crypto.randomUUID();
      store.entriesByToken.set(token, entry);
      store.queue.push(token);
    }
    store.total = store.completedRefs.size + entries.length;
    return store;
  }

  next(clientId: string): BlindItem | null {
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
