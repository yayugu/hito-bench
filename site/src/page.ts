import type { Dataset } from "./data";
import { REPO_URL } from "./data";
import {
  CREATOR_COLORS,
  brandMarkHtml,
  brandSymbols,
  hasBrandIcon,
} from "./colors";
import {
  esc,
  fmtCost,
  overallBarChart,
  problemBarChart,
  scatterChart,
} from "./charts";

const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function renderPage(data: Dataset, css: string): string {
  const { problems, models, pricing } = data;
  const anyIncomplete = models.some((m) => !m.complete);

  // 凡例はロゴのある会社 -> 色を付けた会社 -> グレーの会社（まとめて「その他」）
  const byCreator = new Map<string, number>();
  for (const m of models) byCreator.set(m.creator, (byCreator.get(m.creator) ?? 0) + 1);
  const colored = [...byCreator.entries()]
    .filter(([c]) => CREATOR_COLORS[c] !== undefined)
    .sort(
      (a, b) =>
        Number(hasBrandIcon(b[0])) - Number(hasBrandIcon(a[0])) ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    )
    .map(([c]) => c);
  const others = [...byCreator.keys()]
    .filter((c) => CREATOR_COLORS[c] === undefined)
    .sort();

  // 表の各スコア列で最高点・最低点を出しておく（同点はすべて強調する）
  const extremes = new Map<string, { best: number; worst: number }>();
  const track = (key: string, values: number[]) => {
    if (values.length > 1) {
      extremes.set(key, { best: Math.max(...values), worst: Math.min(...values) });
    }
  };
  track(
    "overall",
    models.map((m) => m.score),
  );
  for (const problem of problems) {
    track(
      problem.id,
      models.flatMap((m) => {
        const cell = m.cells.get(problem.id);
        return cell ? [cell.score] : [];
      }),
    );
  }
  const rank = (key: string, value: number): string => {
    const e = extremes.get(key);
    if (!e || e.best === e.worst) return "";
    if (value === e.best) return " best";
    if (value === e.worst) return " worst";
    return "";
  };

  const problemSections = problems
    .map(
      (p, i) => `<section id="problem-${esc(p.id)}">
  <div class="sec-head">
    <h2><span class="num">${i + 3}</span><a href="${esc(
      p.githubUrl,
    )}" target="_blank" rel="noopener">${esc(p.title)}</a></h2>
  </div>
  <div class="card">${problemBarChart(models, p.id)}</div>
</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIが出力する日本語の自然さを比較 HitoBench</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="14">人</text></svg>',
  )}">
<style>
${css}
</style>
</head>
<body>
${brandSymbols()}
<div class="wrap">

<header class="site-head">
  <div>
    <h1>AIが出力する日本語の自然さを比較 HitoBench</h1>
    <p class="lede">LLMが生成した日本語の表現力と自然さを判定するベンチマークです。問題やお題を出して人間がていねいに採点しています。採点時はどのモデルの出力かを知らない状態で実施しました。100点満点。</p>
  </div>
  <div class="head-actions">
    <a class="btn" href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
  </div>
</header>

<div class="legend">
  ${colored
    .map((c) => `<span class="legend-item">${brandMarkHtml(c)}${esc(c)}</span>`)
    .join("\n  ")}
  ${
    others.length
      ? `<span class="legend-item">${brandMarkHtml(others[0])}${esc(
          others.join(" / "),
        )}</span>`
      : ""
  }
</div>

<section id="overall">
  <div class="sec-head">
    <h2><span class="num">1</span>総合スコア</h2>
  </div>
  <div class="card">${overallBarChart(models)}</div>
</section>

<section id="cost">
  <div class="sec-head">
    <h2><span class="num">2</span>スコアとコストパフォーマンス</h2>
  </div>
  <div class="card">${scatterChart(models)}</div>
</section>

${problemSections}

<section id="table">
  <div class="sec-head">
    <h2><span class="num">${problems.length + 3}</span>全結果</h2>
  </div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th class="col-model">モデル</th>
          <th class="col-score">総合</th>
          ${problems
            .map(
              (p) =>
                `<th class="col-problem"><a href="${esc(
                  p.githubUrl,
                )}" target="_blank" rel="noopener">${esc(p.title)}</a></th>`,
            )
            .join("\n          ")}
          <th class="col-price col-price-start">コスト/問</th>
          <th class="col-price">入力 $/1M</th>
          <th class="col-price">出力 $/1M</th>
          <th class="col-price col-source">価格出典</th>
        </tr>
      </thead>
      <tbody>
        ${models
          .map(
            (m, i) => `<tr>
          <td class="col-rank">${i + 1}</td>
          <td class="col-model">${brandMarkHtml(m.creator)}<a href="${esc(
            m.githubUrl,
          )}" target="_blank" rel="noopener">${esc(m.label)}</a>${
              m.complete ? "" : '<span class="dim">*</span>'
            }</td>
          <td class="col-score${rank("overall", m.score)}">${fmtScore(m.score)}</td>
          ${problems
            .map((p) => {
              const cell = m.cells.get(p.id);
              if (!cell) return `<td class="dim">–</td>`;
              return `<td class="${rank(p.id, cell.score).trim()}">${fmtScore(
                cell.score,
              )}</td>`;
            })
            .join("\n          ")}
          <td class="col-price col-price-start">${fmtCost(m.costPerTask)}</td>
          <td class="col-price dim">$${m.price.input.toFixed(2)}</td>
          <td class="col-price dim">$${m.price.output.toFixed(2)}</td>
          <td class="col-price col-source dim"><a href="${esc(
            m.price.source_url,
          )}" target="_blank" rel="noopener">${esc(
              sourceLabel(m.price.price_source),
            )}</a></td>
        </tr>`,
          )
          .join("\n        ")}
      </tbody>
    </table>
  </div>
</section>

<div class="notes">
  <h2>このページについて</h2>
  <ul>
    <li>コストは1問あたりの推定額です。実行時のトークン数は記録していないため、実際の入力プロンプトと回答本文の文字数からトークン数を推定して計算しています（ASCII ${
      pricing.token_estimate.ascii_chars_per_token
    }文字 = 1 token、それ以外 1文字 = ${
      pricing.token_estimate.wide_tokens_per_char
    } token）。<strong>reasoning / thinking トークンは含みません</strong>ので、推論を回すモデルでは実額より安く出ます。</li>
    <li>単価は大手三社（Anthropic / OpenAI / Google）は各社の公式 API 料金、それ以外は OpenRouter で <code>benchmark.yaml</code> に指定している provider の長期 effective price（期間限定の割引を含まない定価）です。</li>
  </ul>
  <p class="foot">Generated ${esc(data.generatedAt.slice(0, 10))} · <a href="${REPO_URL}" target="_blank" rel="noopener">github.com/yayugu/hito-bench</a></p>
</div>

</div>
<div id="tip" role="status"></div>
<script>
${clientScript()}
</script>
</body>
</html>
`;
}

function sourceLabel(src: string): string {
  switch (src) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    default:
      return "OpenRouter";
  }
}

function clientScript(): string {
  return `
(function () {
  var tip = document.getElementById("tip");

  function show(text, x, y) {
    tip.textContent = text;
    tip.dataset.show = "1";
    var r = tip.getBoundingClientRect();
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    var top = Math.max(8, y - r.height - 12);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hide() {
    tip.dataset.show = "0";
  }

  document.addEventListener("pointermove", function (e) {
    var host = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (host) show(host.dataset.tip, e.clientX, e.clientY);
    else hide();
  });

  document.addEventListener("pointerleave", hide);

  document.addEventListener("focusin", function (e) {
    var host = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!host) return hide();
    var r = host.getBoundingClientRect();
    show(host.dataset.tip, r.left + r.width / 2, r.top);
  });
  document.addEventListener("focusout", hide);

})();
`;
}
