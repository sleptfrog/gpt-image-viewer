# AGENTS.md

このファイルは、このリポジトリで作業するAI coding agent向けの最初に読む作業ガイドです。

## プロジェクト概要

GPT Image Viewer は、ChatGPT Web UIで生成された画像を、ユーザー入力・生成プロンプト・キャプション・message ID・conversation ID・image ID・作成日時などのメタデータと一緒にローカル保存するための個人用Chrome拡張機能です。

最終的な利用イメージ:

- ユーザーはGoogle Chromeで通常通りChatGPTを使う。
- 拡張機能ボタンからChrome Side Panelを開く。
- 現在のチャットに含まれる生成画像を一覧・閲覧する。
- 必要な画像を選択し、メタデータ付きで保存する。
- 画像へメタデータを埋め込めない場合は、sidecar JSONを同梱する。

このプロジェクトはユーザー本人のブラウザセッションと本人のChatGPT会話を対象にしたローカルファーストのツールです。外部送信を前提にしないでください。

## 開発・利用環境

- 利用対象ブラウザ: Google Chrome
- 開発にはNode.js/npmを使う
- `npm run build` で生成される `dist/` をChromeのunpacked extensionとして読み込める
- 利用者側にNode.jsを要求しない配布を優先する
- Docker前提にしない

## 現在のプロダクト状態

現在の主UIはChrome Side Panelです。ChatGPTページへ見えるボタンやパネルを直接埋め込む方針ではありません。

実装済み:

- Manifest V3 Chrome拡張
- Side Panel UI
- ChatGPT会話レスポンスのpage-world hook取得。ただしraw bodyはpostMessageせず、最小化済みメタデータだけを渡す
- `/backend-api/my/recent/image_gen` レスポンスからの画像URL辞書取り込み
- チャットDOM上の表示済み画像URLスキャン
- 画像URL辞書のsession storage保存
- 画像URL辞書のインポート/エクスポート/全削除
- 生成画像/ユーザー添付画像/不明画像の分類
- 生成画像に対応するユーザー入力の抽出
- ユーザー添付画像の初期非表示トグル
- 画像一覧、選択チェック、全選択/全選択解除
- 選択画像のZIP保存
- 単体画像保存
- PNG/JPEG/WebPへのメタデータ埋め込み
- 埋め込み失敗時のsidecar JSON
- サイドパネル内画像ビューア
- 画像コピー、caption/promptコピー
- 日本語UI

画像URLがまだ辞書にない項目は、UI上では「画像未取得」と表示します。この場合はChatGPTの「画像」ページを開き、対象画像が読み込まれるまでスクロールすることでURL辞書に取り込めます。

## 開発コマンド

```bash
npm install
npm test
npm run build
npm run package
npm run typecheck
npm run release-check
```

追加で公開前チェックをする場合:

```bash
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm audit --audit-level=moderate
git diff --check
```

`npm run release-check` は、リリース前の機械的チェックです。作業ツリーclean、version一致、test/build/package、ZIP内容検査を行います。スクリプト開発中など、未コミット差分を許容して動作確認する場合だけ `node scripts/release-check.mjs --allow-dirty` を使ってください。

通常ビルドではsourcemapを生成しません。拡張機能のデバッグでsourcemapが必要な場合だけ `npm run build:debug` を使ってください。

## Chromeでの確認手順

1. `npm run build` を実行する。
2. Chromeで `chrome://extensions` を開く。
3. Developer Modeを有効にする。
4. `dist/` をunpacked extensionとして読み込む。
5. 変更後は拡張機能をリロードし、ChatGPTタブも再読み込みする。

## 配布状態

- 現在はChrome Web Store未公開。
- READMEには、現時点で利用可能な方法として、リポジトリをビルドしてunpacked extensionとして読み込む手順だけを書く。
- Chrome Web Store提出用ZIPは `npm run package` で `release/` に作成する。
- READMEへ配布者向けの提案や検討メモを書かない。READMEには利用者やリポジトリ閲覧者にとって確定済みの事実だけを書く。

## リポジトリ構成

```text
.
├── public/
│   └── manifest.json
├── src/
│   ├── background/service-worker.ts
│   ├── content/
│   ├── metadata/
│   ├── shared/
│   └── sidepanel/
├── tests/
│   ├── fixtures/
│   ├── metadata/
│   └── shared/
├── README.md
├── AGENTS.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

`dist/` と `release/` は生成物でGit管理外です。

## アーキテクチャ

### Page hook

`src/content/page-hook.ts` はChatGPTページのMAIN worldで `fetch` と `XMLHttpRequest` をラップし、対象レスポンスをページ内で最小化済みメタデータへ変換してから `window.postMessage` でcontent scriptへ渡します。

対象:

- `/backend-api/conversation/*`
- `/backend-api/my/recent/image_gen`

認証ヘッダー、Cookie、トークンは収集しません。

### Content script

`src/content/content-script.ts` はpage hookから受け取った最小化済みメタデータを検証し、background service workerへ渡します。

### Background service worker

`src/background/service-worker.ts` はcontent scriptから受け取った検証済みメタデータを `chrome.storage.session` に保存します。

- 会話ごとの正規化済み `ImageMetadata`
- `file_*` ごとの画像URL辞書

rawレスポンス本文はpostMessageせず、backgroundにも渡さず、永続化もしません。

### Side Panel

`src/sidepanel/` は通常利用するUIです。

- 現在のChatGPTタブURLからconversation IDを判定
- session storage内のメタデータを読み込み
- 必要に応じて現在ページDOMの画像URLをスキャン
- 画像未取得の項目には案内ラベルを表示
- ユーザー添付画像は初期状態で非表示にし、`添付画像を表示` トグルで表示
- 選択画像をZIP保存
- 画像ビューアを表示

### Metadata parser

`src/metadata/parse-chatgpt.ts` はconversation JSONの `mapping` を走査します。

- `content_type: "code"` のJSON textから生成プロンプトを読む
- 生成画像の祖先または直前のuser messageから `userInput` を読む
- tool messageの `image_asset_pointer` を読む
- user message内の `image_asset_pointer` は `imageRole: "user_attachment"` として扱う
- tool/assistant側の画像や生成プロンプト/キャプションと関連する画像は `imageRole: "generated"` として扱う
- `metadata.image_gen_title` と `Model caption:` を読む
- 同一 `imageId` の重複レコードを統合する

`src/metadata/parse-recent-image-gen.ts` はChatGPTの「画像」ページで読み込まれるrecent image responseから画像URL辞書用レコードを抽出します。

### Metadata embedding

`src/metadata/embed-image-metadata.ts` は元画像バイト列をできるだけ保ったままメタデータを追加します。

- PNG: UTF-8 `iTXt` chunk
- JPEG: APP1 XMP packet
- WebP: RIFF `XMP` chunk

埋め込みできない場合は元画像とsidecar JSONを保存します。

## メタデータモデル

```ts
type ImageMetadata = {
  source: "chatgpt-web";
  conversationId?: string;
  messageId?: string;
  imageId?: string;
  imageUrl?: string;
  prompt?: string;
  revisedPrompt?: string;
  caption?: string;
  userInput?: string;
  imageRole?: "generated" | "user_attachment" | "unknown";
  createdAt?: string;
  capturedAt: string;
  raw?: unknown;
};
```

`userInput` は生成画像に対応するユーザー側の入力文です。`prompt` はChatGPTがimage generation toolへ渡した生成プロンプトであり、ユーザー入力とは分けて扱ってください。

`imageRole` は画像の由来を表します。`generated` は生成画像、`user_attachment` はユーザーが会話へ添付した画像、`unknown` は判定不能です。UIでは `user_attachment` を初期状態で非表示にし、`generated` と `unknown` は表示対象に残します。

`raw` は型には残しますが、通常のエクスポートや保存対象には含めません。

## 権限とプライバシー方針

現在のmanifest権限:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `sidePanel`
- `downloads`
- `storage`
- `scripting`
- `clipboardWrite`

使わない方針:

- `<all_urls>`
- `cookies`
- `webRequest` によるレスポンス本文取得
- `debugger` API。ただし将来の最終手段として検討余地はある
- 外部サービス送信

ユーザー入力、プロンプト、画像、メタデータ、会話情報はデフォルトで外部送信しません。

## Git管理ルール

コミットしないもの:

- `dist/`
- `release/`
- `node_modules/`
- `coverage/`
- `.vitest/`

実チャット履歴、実画像、認証付きURL、署名付きURLはリポジトリ外で管理してください。データ構造の確認には `tests/fixtures/` のサニタイズ済みfixtureを使います。

コミット前チェック推奨:

```bash
git status --short --ignored
git diff --check
npm test
npm run build
npm run package
npm audit --audit-level=moderate
```

秘密情報チェックでは、少なくとも以下を確認してください。

- API key、access token、session token、Cookieがないこと
- `sig=` 付きURLはfixture内で `redacted` になっていること
- ローカルパスやユーザー名が入っていないこと
- 実画像や実チャットJSONが入っていないこと

## テスト方針

壊れやすい箇所を優先してテストします。

- ChatGPT conversation parser
- userInput / imageRole extraction
- recent image response parser
- URL parsing
- ZIP writer
- PNG/JPEG/WebP metadata embedding
- metadata exportから `raw` を除外すること

テストfixtureは `tests/fixtures/` に最小化・サニタイズ済みのものだけを置きます。

## 既知の制限と今後の候補

- ChatGPTの内部APIやDOM構造が変わると壊れる可能性があります。
- ChatGPTの「画像」ページを開かずに全画像URLを直接取得する機能は未実装です。
- サイドパネルはChromeの仕様上、パネル外へ拡大表示できません。大きなビューアが必要なら、拡張機能の別タブ/別ウィンドウ形式を検討してください。
- Chrome Web Store版は未公開です。提出用ZIP作成は `npm run package` で対応しています。
- ライセンスはMITです。詳細は `LICENSE` を参照してください。

## 作業ルール

- 変更前に既存コードを読む。
- ユーザーの未コミット変更を勝手に戻さない。
- 権限追加は最小限にし、理由を明記する。
- 仕様変更時はREADMEとAGENTS.mdも更新する。
- 公開リポジトリ前提で、実データや秘密情報を含めない。
- Chrome API挙動が不確かな場合は公式ドキュメントを優先する。
- UI変更はサイドパネルの小さい幅でも破綻しないようにする。

## 参考リンク

- Chrome content scripts: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- Chrome downloads API: <https://developer.chrome.com/docs/extensions/reference/api/downloads>
- Chrome sidePanel API: <https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- Chrome extension samples: <https://github.com/GoogleChrome/chrome-extensions-samples>
