const form = document.querySelector("#evaluation");
const loading = document.querySelector("#loading");
const complete = document.querySelector("#complete");
const title = document.querySelector("#title");
const prompt = document.querySelector("#prompt");
const response = document.querySelector("#response");
const progress = document.querySelector("#progress");
const score = document.querySelector("#score");
const comment = document.querySelector("#comment");
const error = document.querySelector("#error");
const button = form.querySelector("button");

const storageKey = "hito-bench-client-id";
let clientId = localStorage.getItem(storageKey);
if (!clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem(storageKey, clientId);
}

let currentToken = null;

async function loadNext() {
  loading.hidden = false;
  form.hidden = true;
  complete.hidden = true;
  error.hidden = true;
  const apiResponse = await fetch(`/api/next?client=${encodeURIComponent(clientId)}`);
  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error || "回答を読み込めませんでした");
  loading.hidden = true;

  if (!data.item) {
    progress.textContent = "完了";
    complete.hidden = false;
    return;
  }

  currentToken = data.item.token;
  title.textContent = data.item.problem.title;
  prompt.textContent = data.item.problem.prompt;
  response.textContent = data.item.response;
  progress.textContent = `${data.item.progress.completed} / ${data.item.progress.total}`;
  score.value = "";
  comment.value = "";
  form.hidden = false;
  score.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Number(score.value);
  if (score.value.trim() === "" || !Number.isFinite(value)) {
    error.textContent = "点数を数値で入力してください。";
    error.hidden = false;
    return;
  }

  button.disabled = true;
  error.hidden = true;
  try {
    const apiResponse = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: clientId, token: currentToken, score: value, comment: comment.value }),
    });
    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.error || "採点を保存できませんでした");
    await loadNext();
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "エラーが発生しました";
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

loadNext().catch((cause) => {
  loading.textContent = cause instanceof Error ? cause.message : "エラーが発生しました";
});
