import { mkdir, readdir, rename } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { parse, stringify } from "yaml";
import { loadAnswer, loadProblems } from "./config";
import type { AnswerEntry, Evaluation } from "./types";

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

  private constructor(private readonly evaluationsDirectory: string) {}

  static async create(root: string): Promise<EvaluationStore> {
    const store = new EvaluationStore(join(root, "evaluations"));
    await mkdir(store.evaluationsDirectory, { recursive: true });
    await store.loadCompleted();

    const problems = await loadProblems(join(root, "problems"));
    const problemById = new Map(problems.map((problem) => [problem.id, problem]));
    const answersRoot = join(root, "answers");
    const runnerDirectories = await readdir(answersRoot, { withFileTypes: true });
    const entries: AnswerEntry[] = [];
    for (const directory of runnerDirectories.filter((entry) => entry.isDirectory())) {
      const directoryPath = join(answersRoot, directory.name);
      const files = (await readdir(directoryPath)).filter((name) => /\.ya?ml$/i.test(name)).sort();
      for (const file of files) {
        const path = join(directoryPath, file);
        const answerRef = relative(answersRoot, path);
        if (store.completedRefs.has(answerRef)) continue;
        const answer = await loadAnswer(path);
        const problem = problemById.get(answer.problem_id);
        if (!problem) throw new Error(`${path}: unknown problem ${answer.problem_id}`);
        if (basename(file).replace(/\.ya?ml$/i, "") !== answer.problem_id) {
          throw new Error(`${path}: problem_id must match filename`);
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

  private async loadCompleted(): Promise<void> {
    const directories = await readdir(this.evaluationsDirectory, { withFileTypes: true });
    for (const directory of directories.filter((entry) => entry.isDirectory())) {
      const directoryPath = join(this.evaluationsDirectory, directory.name);
      const files = (await readdir(directoryPath)).filter((name) => /\.ya?ml$/i.test(name));
      for (const file of files) {
        const path = join(directoryPath, file);
        const value = parse(await Bun.file(path).text()) as Partial<Evaluation>;
        if (value.version === 1 && typeof value.problem_id === "string") {
          this.completedRefs.add(join(directory.name, file));
        }
      }
    }
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

    const evaluation: Evaluation = {
      version: 1,
      problem_id: entry.problem.id,
      score,
      comment,
      evaluated_at: new Date().toISOString(),
    };
    const evaluationDirectory = join(this.evaluationsDirectory, dirname(entry.answerRef));
    await mkdir(evaluationDirectory, { recursive: true });
    const file = basename(entry.answerRef);
    const finalPath = join(evaluationDirectory, file);
    const temporaryPath = join(evaluationDirectory, `.${file}.tmp`);
    await Bun.write(temporaryPath, stringify(evaluation, { lineWidth: 0, blockQuote: "literal" }));
    await rename(temporaryPath, finalPath);

    this.completedRefs.add(entry.answerRef);
    this.entriesByToken.delete(token);
    this.tokenByClient.delete(clientId);
  }
}
