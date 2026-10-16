# 十六月書房・新トップページ（改修案）

このブランチは **表現活動のポートフォリオ** の試作です。開発の情報は beyond the Word の別サイトを想定し、作品カテゴリには混ぜません。現行 `main` の公開ページはこのPRをマージするまで変更されません。

## 構造

- `/index.html` — スクロールで概要と各室への入口を示すLP。ファーストビューは後から差し替えられる演出層。
- `/haiku/index.html` — 既存の俳句宇宙（`vis-network`）。コードとデータは基本的に継承。
- `/bookshelf/index.html` — 文芸・論考・断片・企画ノートの一覧。
- `/contentsviewer/index.html?slug=...` — 既存Markdownの読書画面。
- `/zine-viewer/index.html` — 既存3D ZINEギャラリー。
- `/about/index.html` — **筆名、自己紹介、活動歴はプレイスホルダー**。旧プロフィールは本番の改修案から外した。

## 更新のしかた

### 新しい文章を追加

`data/MD_contents_master/04-works/新作.md` などにMarkdownを追加します。本文の先頭へ以下を記述します。

```yaml
---
title: 新作のタイトル
type: work
status: published
created: 2026-10-16
description: 短い紹介文
topics: [文学, 神話]
featured: true
featuredOrder: 1
---
```

本文を書いてコミットするだけです。タイトル・種別・説明・公開状態はこのファイル内で管理し、`topics` は既存キーワード辞書にある語を紐付けます。`featured: true` と `featuredOrder` は任意で、トップのおすすめ欄に使います。

新規Markdownは `status: published` のものだけ公開索引に登録。編集中の場合は `status: draft` にしてください。**すでに登録されている作品は従来どおり表示**されます。ただし既存作品に `status: draft` を付けると非公開一覧から除外されます。

カテゴリ: `fragment`（断片）, `essay`（論考）, `project-note`（制作記録）, `work`（創作・小説）。フォルダから自動推定もできます。

### サイト全体について

- トップのテキスト・リンク: `index.html`
- トップのデザイン: `home.css`
- トップのおすすめ選定と俳句表示: `home.js`
- **筆名・About Me・活動歴の公開文**: `about/index.html` の「準備中」部分を書き換える（決まるまで公開文を挿入しない）
- 文芸の本文: 各 `.md` ファイル。索引生成: `tools/build_content_index.py`
- 俳句・キーワード: `data/haiku.json`, `data/keywords.json`。既存の管理方法を維持
- ZINE: `zine-viewer/assets/volXX/` にデータを置く。現状の `zine-viewer/generate_config.py` で `config.js` 生成

### ローカル確認

```sh
python3 tools/build_content_index.py
python3 -m http.server 8000
```

`http://localhost:8000/` にアクセス。JavaScriptによる `fetch` を使うため、ファイルを直接ダブルクリックせずHTTPサーバー経由で見てください。

### GitHub PagesでMarkdown自動登録を使う

PRをマージする前に **Settings → Pages → Build and deployment → Source: GitHub Actions** を選ぶ必要があります。設定後、`main` にコミットするたび `.github/workflows/pages.yml` が最新のMarkdownを索引化し、静的ファイルと共にPagesへデプロイします。GitHub Pagesの `Deploy from a branch` のままだと自動生成は走らず、Markdownと `content.json` の同時更新が必要です。

### 未完了・意図的な保留

- ファーストビューのモチーフ・演出は**試作**。最終的な表現は未決定。動きが苦手な人には `prefers-reduced-motion` で停止。
- 筆名・自己紹介・活動年表は仮テキストのまま。
- beyond the Word のドメインはまだ未設定なので、開発活動へのリンクは **暫定的にGitHub**。
- 俳句宇宙やZINEビューア自体のコード刷新はこのPRでは行わない。
- サイトの改修を公開する前にブラウザのPC/スマートフォン実機で見た目と速度を確認すること。
