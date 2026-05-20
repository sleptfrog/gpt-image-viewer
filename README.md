# GPT Image Viewer

GPT Image Viewer は、ChatGPT のWeb UIで生成された画像を、プロンプトやキャプションなどのメタデータと一緒に閲覧・ローカル保存するためのChrome拡張機能です。

この拡張機能はChatGPTやOpenAIの公式プロダクトではありません。ChatGPTのWeb UI内部APIやレスポンス形式に依存しているため、ChatGPT側の変更で動かなくなる可能性があります。

## 主な機能

- Chromeの拡張機能ボタンからサイドパネルを開き、現在のChatGPTチャット内の生成画像を一覧表示
- 画像ごとのキャプション、プロンプト、画像ID、作成日時を表示
- サムネイルクリックで簡易画像ビューアを表示
- ビューア内で前後移動、画像コピー、キャプション/プロンプトコピー、保存が可能
- 選択した画像をZIPで保存
- PNG/JPEG/WebPにメタデータを埋め込み、埋め込みできない場合はsidecar JSONを同梱
- ChatGPTの「画像」ページで読み込まれた画像URLを辞書として取り込み、チャット上では表示されていない過去画像の表示にも利用
- メタデータJSONと画像URL辞書のインポート/エクスポート

## 保存される情報

取得できる範囲で、以下のような情報を画像ファイルまたはsidecar JSONに保存します。

- conversation ID
- message ID
- image ID
- 画像URL
- 生成プロンプト
- キャプション
- 作成日時
- 取得日時

rawレスポンス本文は保存対象にしません。

## プライバシーと権限

この拡張機能はローカル処理を前提にしています。プロンプト、画像、メタデータを外部サービスへ送信しません。

現在の主な権限は以下です。

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `sidePanel`
- `downloads`
- `storage`
- `scripting`
- `clipboardWrite`

`<all_urls>`、`cookies`、`webRequest`、`debugger` などの広い/強い権限は使っていません。

## インストール

現在、Chrome Web Store版は未公開です。利用する場合は、このリポジトリをビルドし、Chromeにunpacked extensionとして読み込んでください。

```bash
npm install
npm run build
```

その後、Chromeで以下を行います。

1. `chrome://extensions` を開きます。
2. デベロッパーモードを有効にします。
3. `dist/` フォルダをunpacked extensionとして読み込みます。

## 使い方

1. ChatGPTのチャットページを開きます。
2. Chromeの拡張機能ボタンからGPT Image Viewerのサイドパネルを開きます。
3. 保存したい画像にチェックを入れます。
4. `選択した画像を保存` を押します。

画像未取得の項目がある場合は、ChatGPTの「画像」ページを開き、対象画像が表示されるまでスクロールしてください。ChatGPT自身が読み込んだ画像URLを拡張機能が辞書へ取り込みます。

## 開発

開発にはNode.js/npmが必要です。Chromeに読み込む拡張機能一式は `npm run build` で `dist/` に生成されます。

```bash
npm install
npm test
npm run build
```

リリース用パッケージは `npm run package` で `release/` に生成されます。ZIPの直下に `manifest.json` が入る形式で作成され、sourcemapは含めません。

```bash
npm run package
```

通常ビルドではsourcemapを生成しません。拡張機能のデバッグでsourcemapが必要な場合だけ、以下を使います。

```bash
npm run build:debug
```

追加のチェック:

```bash
npm run typecheck
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm audit --audit-level=moderate
```

## リポジトリ構成

```text
.
├── public/                 # Chrome拡張のmanifestとページ注入用スクリプト
├── src/
│   ├── background/         # Service worker
│   ├── devtools/           # Phase 1 DevTools panel
│   ├── metadata/           # ChatGPTレスポンス解析と画像メタデータ埋め込み
│   ├── shared/             # storage、URL辞書、ZIPなどの共通処理
│   └── sidepanel/          # 通常利用するサイドパネルUI
├── tests/                  # Vitest tests and sanitized fixtures
├── AGENTS.md               # AI coding agent向けの作業ガイド
└── dist/                   # ビルド出力
```

## 既知の制限

- ChatGPTの内部APIやWeb UI構造に依存しています。
- チャットページ上で未表示の画像は、ChatGPTの「画像」ページで一度読み込むまで画像未取得になる場合があります。
- サイドパネル自体はChromeの仕様上、ブラウザ全体には広がりません。より大きなビューアは将来、別タブ/別ウィンドウ形式で検討します。
- Chrome Web Store版は未公開です。

## ライセンス

MIT Licenseです。詳しくは [LICENSE](./LICENSE) を参照してください。
