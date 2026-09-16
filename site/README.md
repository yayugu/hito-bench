# site/ — 結果ページのビルド

`problems/` と `results/` と `site/pricing.yaml` から、1枚もののHTML（画像も外部JSもなし）を生成します。

```bash
bun run build:site            # -> site/dist/index.html
bun run site/build.ts --out docs   # 出力先を変えたいとき
```

出力は完全に自己完結（CSSとJSはインライン）なので、`site/dist/index.html` をそのまま
GitHub Pages なり任意の静的ホスティングに置けます。`site/dist/` は gitignore 済み。

## ページに載せているもの

- 問題のタイトル
- 各モデルの点数（総合の平均 / 問題ごと）
- 単価と1問あたりの推定コスト

問題文・狙い・採点基準・回答本文・講評は**載せず**、GitHub の該当ファイルへのリンクにしています。

## 構成

| ファイル | 役割 |
| --- | --- |
| `build.ts` | エントリポイント |
| `src/data.ts` | YAML の読み込み、コスト推定、パレート最前線の計算 |
| `src/charts.ts` | SVG（横棒グラフ・散布図）の生成。ラベルの衝突回避もここ |
| `src/page.ts` | HTML 組み立て + クライアント側の小さなJS（ツールチップ・テーマ切替） |
| `src/style.css` | インラインで埋め込まれるCSS |
| `pricing.yaml` | **手動メンテの価格表**（下記） |

## pricing.yaml

ビルド時にネットワークへは出ません。価格は事前に取得して書き置きしておく方針です。

- 大手三社（Anthropic / OpenAI / Google）は各社の公式 API 料金
- それ以外は OpenRouter の、`benchmark.yaml` で指定している provider の
  長期 effective price（期間限定の割引・プロモを含まない定価）

`results/<id>/` に対応するエントリが `pricing.yaml` に無いモデルは、警告を出して
ページから除外されます。モデルを追加したらここにも1エントリ足してください。

### コスト推定について

実行時のトークン数はログに残していないため、入力プロンプトと回答本文の**文字数から
トークン数を推定**しています（係数は `pricing.yaml` の `token_estimate`）。
reasoning / thinking トークンは含まれないので、推論を回すモデルでは実額より安く出ます。
