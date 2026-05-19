# AGENTS.md

This file is the first-read project brief for AI coding agents working on this repository.

## Project Summary

Build a personal Chrome extension that helps save images generated in the ChatGPT web UI together with useful metadata found in the page/network data, such as the detailed image prompt, revised prompt, caption, message id, conversation id, image URL, and creation time when available.

The main user goal is:

- Use ChatGPT normally in Chrome on Windows.
- When an image is generated, save the image locally.
- Embed prompt/caption metadata into the saved image file when practical.
- Also support saving a sidecar JSON metadata file as a fallback or debug output.

This project is intended for the user's own browser session and own ChatGPT conversations. Keep the design local-first, transparent, and conservative with permissions.

## User Environment

- Primary machine: Windows.
- Development machine: local Ubuntu server.
- Normal workflow: edit and build on Ubuntu through SSH / remote IDE.
- Browser verification: Windows Chrome.
- Preferred environment split:
    - Ubuntu owns source code, Git, Node.js, package manager, tests, and build tools.
    - Windows Chrome loads the built unpacked extension from a Windows-readable `dist` directory.

Do not assume Docker exists on Windows. Avoid requiring Windows-side Node.js unless there is a strong reason.

## Recommended Development Workflow

1. Develop on Ubuntu.
2. Build the extension into `dist/`.
3. Sync or copy `dist/` to a Windows folder.
4. Open `chrome://extensions` on Windows Chrome.
5. Enable Developer Mode.
6. Load the Windows-side `dist/` folder as an unpacked extension.
7. After each build, reload the extension and reload the ChatGPT tab.

If the repository later adds scripts, document the exact build/sync commands here.

## Product Direction

Start with a low-risk prototype before building the polished page overlay UX.

### Phase 1: DevTools Prototype

Build a DevTools extension first.

Purpose:

- Confirm which ChatGPT network responses contain image metadata.
- Capture response bodies using `chrome.devtools.network`.
- Parse candidate JSON responses into normalized image metadata records.
- Export metadata as JSON.
- Optionally download the corresponding image without embedded metadata yet.

Why this phase matters:

- It matches the user's current manual investigation flow in Chrome DevTools.
- `chrome.devtools.network` can access request information shown in DevTools Network, and `request.getContent()` can retrieve the response body.
- This avoids premature assumptions about ChatGPT's internal response format.

Expected Phase 1 components:

- `manifest.json` with Manifest V3 and `devtools_page`.
- DevTools page.
- Optional DevTools panel.
- Network collector.
- Metadata parser with fixtures/tests.
- Simple export/download action.

### Phase 2: Normal Extension UX

After Phase 1 proves the data shape, build a normal extension experience on the ChatGPT page.

Purpose:

- Add a save button near generated images in the ChatGPT UI.
- Associate visible images with parsed metadata.
- Save images with embedded metadata when possible.
- Save sidecar JSON when embedding is unavailable or disabled.

Likely components:

- Content script for DOM observation and UI injection.
- Page-world injected script for observing `fetch` / `XMLHttpRequest` responses if needed.
- Background service worker for privileged extension work.
- Downloads API integration.
- Options page for filename rules, metadata fields, and output format.

## Important Chrome Extension Facts

- Target Manifest V3.
- Content scripts normally run in an isolated world. They can read and modify the DOM, but they do not share JavaScript variables with the page.
- A content script can use only a limited set of extension APIs directly. Route privileged actions through the background service worker with message passing.
- If page-level `fetch` / `XMLHttpRequest` observation is needed, use a page-world injected script or `world: "MAIN"` where appropriate, then communicate back using `window.postMessage` or DOM events.
- Do not rely on `chrome.webRequest` for response body capture. Use DevTools APIs in Phase 1, or page-level observation in Phase 2.
- Use `chrome.downloads` for saving files from the extension.
- Treat `chrome.debugger` as a later fallback only. It is powerful but has heavier permission and UX implications.

## Metadata Strategy

Preferred metadata model:

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
  createdAt?: string;
  capturedAt: string;
  raw?: unknown;
};
```

Saving strategy:

- Always support sidecar JSON first because it is simple and reliable.
- Add image-embedded metadata after the metadata parser is stable.
- For PNG, investigate `tEXt` / `iTXt` chunks.
- For JPEG, investigate EXIF / XMP.
- For WebP, investigate EXIF / XMP chunks.
- Preserve the original image bytes whenever possible. Avoid canvas re-encoding unless explicitly chosen, because it may alter quality or strip data.

## Security And Privacy Guidelines

- Request the narrowest practical host permissions, ideally only current ChatGPT domains.
- Do not add broad host permissions like `<all_urls>` unless justified and documented.
- Do not collect credentials, cookies, auth headers, session tokens, or unrelated network response bodies.
- Do not send prompts, images, metadata, or conversation data to external services by default.
- Keep all processing local unless the user explicitly asks for remote integration.
- Avoid logging full prompts or raw response bodies to persistent logs.
- Test fixtures must be sanitized before committing.
- The ChatGPT web UI and internal network response format are private implementation details and may change. Write parsers defensively.

## Suggested Repository Shape

This is a proposed shape. Follow it unless the actual toolchain suggests a better local pattern.

```text
.
├── AGENTS.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src
│   ├── manifest.ts or manifest.json
│   ├── background
│   │   └── service-worker.ts
│   ├── content
│   │   ├── content-script.ts
│   │   └── page-hook.ts
│   ├── devtools
│   │   ├── devtools.html
│   │   ├── devtools.ts
│   │   └── panel.ts
│   ├── metadata
│   │   ├── parse-chatgpt.ts
│   │   ├── write-metadata.ts
│   │   └── types.ts
│   └── shared
│       └── messages.ts
├── tests
│   ├── fixtures
│   └── metadata
└── dist
```

## Initial Technical Choices

Prefer:

- TypeScript.
- Vite or another lightweight extension-friendly build setup.
- A small test runner such as Vitest for parser and metadata-writer tests.
- Minimal UI dependencies at first.

Avoid at the beginning:

- Heavy frontend frameworks unless the UI becomes complex.
- Large browser automation setup before the core metadata capture is proven.
- Publishing/store packaging concerns before the local unpacked extension works.

## First Milestone

Deliver a DevTools prototype that can:

1. Load as an unpacked Chrome extension.
2. Add a DevTools panel or run from a DevTools page.
3. Listen to completed network requests.
4. Filter likely ChatGPT conversation/image responses.
5. Call `request.getContent()` for matching responses.
6. Parse response JSON into `ImageMetadata`.
7. Show captured metadata in the panel.
8. Export selected metadata as a `.json` file.

Definition of done:

- The user can generate an image in ChatGPT, keep DevTools open, and see candidate prompt/caption metadata appear in the extension UI.
- Parser behavior is covered by sanitized fixture tests.
- Known unsupported cases are documented.

## Open Questions

Resolve these during implementation:

- Current ChatGPT hostnames to support, for example `https://chatgpt.com/*` and/or legacy `https://chat.openai.com/*`.
- Exact network endpoints and JSON paths containing image prompt/caption metadata.
- Whether generated images are served as PNG, JPEG, WebP, or multiple formats.
- Preferred filename format.
- Whether sidecar JSON should always be saved or only when metadata embedding fails.
- Whether the final UX should be DevTools-only, page overlay, popup action, context menu, or a combination.

## Agent Working Rules

- Read this file before making architecture changes.
- Inspect the existing repository before editing.
- Keep changes scoped to the current milestone.
- Update this file when major decisions change.
- Prefer official Chrome extension documentation when API behavior is uncertain.
- Preserve user-owned changes. Do not revert files unless explicitly asked.
- Add tests for parsers and binary metadata writers; these are the most fragile parts.
- Keep permissions narrow and explain any permission expansion in code review notes or commit messages.

## Official References

- Chrome DevTools Network extension API: <https://developer.chrome.com/docs/extensions/reference/api/devtools/network>
- Chrome content scripts: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- Chrome downloads API: <https://developer.chrome.com/docs/extensions/reference/api/downloads>
- Chrome debugger API: <https://developer.chrome.com/docs/extensions/reference/api/debugger>
- Chrome extension samples: <https://github.com/GoogleChrome/chrome-extensions-samples>
