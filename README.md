# GPT Image Viewer

GPT Image Viewer は、ChatGPT のWeb UIで生成された画像を、ユーザー入力、生成プロンプト、キャプションなどのメタデータと一緒に閲覧・ローカル保存するためのChrome拡張機能です。

GPT Image Viewer is a Chrome extension for viewing and locally saving images generated in the ChatGPT Web UI together with related metadata such as the user's original input, generation prompt, and caption.

この拡張機能はChatGPTやOpenAIの公式プロダクトではありません。ChatGPTのWeb UI内部APIやレスポンス形式に依存しているため、ChatGPT側の変更で動かなくなる可能性があります。

This is not an official ChatGPT or OpenAI product. It depends on ChatGPT Web UI internals, so it may break if ChatGPT changes its internal APIs, DOM structure, or response formats.

## 主な機能 / Features

- Chromeの拡張機能ボタンからサイドパネルを開き、現在のChatGPTチャット内の生成画像を一覧表示
- 画像ごとのユーザー入力、キャプション、生成プロンプト、画像ID、作成日時を表示
- サムネイルクリックで簡易画像ビューアを表示
- ビューア内で前後移動、画像コピー、ユーザー入力/キャプション/生成プロンプトコピー、保存が可能
- 会話内のユーザー添付画像を初期状態で非表示にし、必要に応じて表示を切り替え可能
- 選択した画像をZIPで保存
- PNG/JPEG/WebPにメタデータを埋め込み、埋め込みできない場合はsidecar JSONを同梱
- ChatGPTの「画像」ページで読み込まれた画像URLを辞書として取り込み、チャット上では表示されていない過去画像の表示にも利用
- メタデータJSONと画像URL辞書のインポート/エクスポート

English summary:

- Opens a Chrome Side Panel from the extension button and lists generated images in the current ChatGPT chat.
- Shows user input, caption, generation prompt, image ID, and creation time for each image.
- Provides a simple image viewer with previous/next navigation, image copy, metadata text copy, and save actions.
- Hides user attachment images by default, with a toggle to show them when needed.
- Saves selected images as a ZIP file.
- Embeds metadata into PNG/JPEG/WebP when possible, and includes sidecar JSON when embedding is unavailable.
- Imports image URLs loaded by ChatGPT's Images page into a local dictionary, which can help display older images that are not currently rendered in the chat.
- Supports metadata JSON and image URL dictionary import/export.

## 保存される情報 / Saved Metadata

取得できる範囲で、以下のような情報を画像ファイルまたはsidecar JSONに保存します。

When available, the extension may save the following metadata into the image file or a sidecar JSON file:

- conversation ID
- message ID
- image ID
- image URL
- user input
- generation prompt
- caption
- image role, such as generated image or user attachment
- created time
- captured time

rawレスポンス本文は保存対象にしません。

Raw response bodies are not saved.

保存した画像ファイルやsidecar JSONには、ユーザー入力、生成プロンプト、キャプション、conversation ID、message ID、image ID、画像URLが含まれる場合があります。保存物を共有すると、これらの情報も共有される可能性があります。

Saved images and sidecar JSON files may contain user input, generation prompts, captions, conversation IDs, message IDs, image IDs, and image URLs. If you share saved files, you may also share that metadata.

## プライバシーと権限 / Privacy and Permissions

この拡張機能はローカル処理を前提にしています。ユーザー入力、プロンプト、画像、メタデータを外部サービスへ送信しません。

This extension is designed as a local-first browser tool. It does not send user input, prompts, images, or metadata to external services.

現在の主な権限は以下です。

Main permissions:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `sidePanel`
- `downloads`
- `storage`
- `scripting`
- `clipboardWrite`

`<all_urls>`、`cookies`、`webRequest`、`debugger` などの広い/強い権限は使っていません。

It does not use broad or sensitive permissions such as `<all_urls>`, `cookies`, `webRequest`, or `debugger`.

## インストール / Installation

現在、Chrome Web Store版は未公開です。利用する場合は、このリポジトリをビルドし、Chromeにunpacked extensionとして読み込んでください。

At the moment, install it by building this repository and loading the generated `dist/` directory as an unpacked Chrome extension.

```bash
npm install
npm run build
```

その後、Chromeで以下を行います。

1. `chrome://extensions` を開きます。
2. デベロッパーモードを有効にします。
3. `dist/` フォルダをunpacked extensionとして読み込みます。

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Load the `dist/` directory as an unpacked extension.

## 使い方 / Usage

1. ChatGPTのチャットページを開きます。 / Open a ChatGPT chat page.
2. Chromeの拡張機能ボタンからGPT Image Viewerのサイドパネルを開きます。 / Open the GPT Image Viewer side panel from the Chrome extension button.
3. 保存したい画像にチェックを入れます。 / Select the images you want to save.
4. `選択した画像を保存` を押します。 / Click `Save selected images`.

会話内でユーザーが添付した画像は初期状態では非表示です。必要な場合は `添付画像を表示` をオンにしてください。

Images attached by the user in the chat are hidden by default. Turn on `Attachments` if you want to show them.

画像未取得の項目がある場合は、ChatGPTの「画像」ページを開き、対象画像が表示されるまでスクロールしてください。ChatGPT自身が読み込んだ画像URLを拡張機能が辞書へ取り込みます。

If some items are shown as not loaded, open ChatGPT's Images page and scroll until the target images are visible. The extension imports image URLs that ChatGPT itself loads into the local dictionary.

## 開発 / Development

開発にはNode.js/npmが必要です。Chromeに読み込む拡張機能一式は `npm run build` で `dist/` に生成されます。

Development requires Node.js and npm. `npm run build` generates the unpacked extension files in `dist/`.

```bash
npm install
npm test
npm run build
npm run release-check
```

リリース用パッケージは `npm run package` で `release/` に生成されます。ZIPの直下に `manifest.json` が入る形式で作成され、sourcemapは含めません。

Release packages are generated under `release/` with `npm run package`. The ZIP contains `manifest.json` at its root and does not include sourcemaps.

```bash
npm run package
```

通常ビルドではsourcemapを生成しません。拡張機能のデバッグでsourcemapが必要な場合だけ、以下を使います。

Normal builds do not generate sourcemaps. Use the following command only when sourcemaps are needed for extension debugging.

```bash
npm run build:debug
```

追加のチェック:

```bash
npm run typecheck
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm audit --audit-level=moderate
```

`npm run release-check` は、テスト、ビルド、パッケージ作成、ZIP内容検査などのリリース前チェックをまとめて実行します。作業ツリーがcleanであることを要求します。

`npm run release-check` runs release-time checks, including tests, build, packaging, and ZIP content inspection. It requires a clean working tree.

## リポジトリ構成 / Repository Structure

```text
.
├── public/                 # Chrome extension manifest and public assets
├── src/
│   ├── background/         # Service worker
│   ├── content/            # Content script and page hook for ChatGPT pages
│   ├── metadata/           # ChatGPT parsing and image metadata embedding
│   ├── shared/             # Shared storage, image URL dictionary, ZIP helpers
│   └── sidepanel/          # Main Side Panel UI
├── tests/                  # Vitest tests and sanitized fixtures
├── AGENTS.md               # Working guide for AI coding agents
└── dist/                   # Build output
```

## 既知の制限 / Known Limitations

- ChatGPTの内部APIやWeb UI構造に依存しています。
- チャットページ上で未表示の画像は、ChatGPTの「画像」ページで一度読み込むまで画像未取得になる場合があります。
- サイドパネル自体はChromeの仕様上、ブラウザ全体には広がりません。より大きなビューアは将来、別タブ/別ウィンドウ形式で検討します。
- Chrome Web Store版は未公開です。

English summary:

- This extension depends on ChatGPT internal APIs and Web UI structure.
- Images not currently rendered in the chat may remain unloaded until they are loaded once on ChatGPT's Images page.
- Chrome Side Panel cannot expand across the full browser window. A larger viewer may be considered in the future as a separate tab or window.
- The Chrome Web Store version is not currently available.

## ライセンス / License

MIT Licenseです。詳しくは [LICENSE](./LICENSE) を参照してください。

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
