import {
  extractEstuaryImageId,
  isChatGptConversationUrl,
  isChatGptEstuaryContentUrl,
  parseChatGptResponse
} from "../metadata/parse-chatgpt";
import { createMetadataExport, stripRawMetadata } from "../metadata/write-metadata";
import type { ImageMetadata } from "../metadata/types";

type DevToolsRequest = {
  request: {
    method?: string;
    url: string;
  };
  response: {
    status: number;
    content?: {
      mimeType?: string;
    };
  };
  getContent: (callback: (content: string, encoding: string) => void) => void;
};

type CapturedItem = {
  key: string;
  selected: boolean;
  metadata: ImageMetadata;
  reasons: Set<string>;
  sourceUrls: Set<string>;
};

const captured = new Map<string, CapturedItem>();
const liveConversationRequests: DevToolsRequest[] = [];
const imageUrls = new Map<string, string>();

const statusEl = queryRequired<HTMLParagraphElement>("#status");
const countEl = queryRequired<HTMLSpanElement>("#item-count");
const listEl = queryRequired<HTMLElement>("#list");
const rescanButton = queryRequired<HTMLButtonElement>("#rescan");
const clearButton = queryRequired<HTMLButtonElement>("#clear");
const exportSelectedButton = queryRequired<HTMLButtonElement>("#export-selected");
const exportAllButton = queryRequired<HTMLButtonElement>("#export-all");

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Panel DOM is missing ${selector}.`);
  }

  return element;
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function metadataKey(item: ImageMetadata): string {
  return item.imageId ?? item.messageId ?? `${item.conversationId ?? "conversation"}:${item.capturedAt}`;
}

function metadataScore(item: ImageMetadata): number {
  return [
    item.imageId ? 1 : 0,
    item.imageUrl ? 1 : 0,
    item.prompt ? 4 : 0,
    item.revisedPrompt ? 2 : 0,
    item.caption ? 3 : 0
  ].reduce((sum, score) => sum + score, 0);
}

function mergeMetadata(existing: ImageMetadata, incoming: ImageMetadata): ImageMetadata {
  const existingScore = metadataScore(existing);
  const incomingScore = metadataScore(incoming);
  const preferIncomingIdentity = incomingScore >= existingScore;
  const createdAt = earliestIso(existing.createdAt, incoming.createdAt);

  return stripRawMetadata({
    ...existing,
    ...incoming,
    conversationId: incoming.conversationId ?? existing.conversationId,
    messageId: preferIncomingIdentity ? incoming.messageId ?? existing.messageId : existing.messageId ?? incoming.messageId,
    imageId: incoming.imageId ?? existing.imageId,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    prompt: incoming.prompt ?? existing.prompt,
    revisedPrompt: incoming.revisedPrompt ?? existing.revisedPrompt,
    caption: preferLonger(incoming.caption, existing.caption),
    createdAt,
    capturedAt: incoming.capturedAt
  });
}

function earliestIso(first?: string, second?: string): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function preferLonger(first?: string, second?: string): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return first.length >= second.length ? first : second;
}

function upsertMetadata(items: ImageMetadata[], reason: string, sourceUrl: string): void {
  for (const item of items) {
    const key = metadataKey(item);
    const existing = captured.get(key);

    if (existing) {
      existing.metadata = mergeMetadata(existing.metadata, item);
      existing.reasons.add(reason);
      existing.sourceUrls.add(sourceUrl);
      continue;
    }

    captured.set(key, {
      key,
      selected: true,
      metadata: stripRawMetadata(item),
      reasons: new Set([reason]),
      sourceUrls: new Set([sourceUrl])
    });
  }
}

function applyKnownImageUrls(): void {
  for (const item of captured.values()) {
    const imageId = item.metadata.imageId;
    if (!imageId || item.metadata.imageUrl) {
      continue;
    }

    const imageUrl = imageUrls.get(imageId);
    if (imageUrl) {
      item.metadata = { ...item.metadata, imageUrl };
      item.reasons.add("matched estuary image URL");
    }
  }
}

function processRequest(request: DevToolsRequest): void {
  const url = request.request.url;

  if (isChatGptEstuaryContentUrl(url)) {
    const imageId = extractEstuaryImageId(url);
    if (imageId) {
      imageUrls.set(imageId, url);
      applyKnownImageUrls();
      render();
      setStatus(`Matched image URL ${imageId}`);
    }
    return;
  }

  if (!isChatGptConversationUrl(url)) {
    return;
  }

  liveConversationRequests.push(request);
  readConversationRequest(request);
}

function readConversationRequest(request: DevToolsRequest): void {
  const url = request.request.url;

  request.getContent((content, encoding) => {
    const decoded = decodeDevToolsContent(content, encoding);
    const parsed = parseChatGptResponse({
      responseBody: decoded,
      responseUrl: url,
      capturedAt: new Date().toISOString(),
      imageUrls
    });

    if (parsed.items.length > 0) {
      upsertMetadata(parsed.items, "conversation response", url);
      applyKnownImageUrls();
      setStatus(`Captured ${parsed.items.length} metadata item(s)`);
      render();
      return;
    }

    const diagnostic = parsed.diagnostics.at(-1)?.message ?? "No image metadata found";
    setStatus(diagnostic);
    render();
  });
}

function decodeDevToolsContent(content: string, encoding: string): string {
  if (encoding === "base64") {
    try {
      return atob(content);
    } catch {
      return content;
    }
  }

  return content;
}

function rescanHarUrls(): void {
  chrome.devtools.network.getHAR((harLog) => {
    let imageUrlCount = 0;
    for (const entry of harLog.entries) {
      const url = entry.request.url;
      if (!isChatGptEstuaryContentUrl(url)) {
        continue;
      }

      const imageId = extractEstuaryImageId(url);
      if (!imageId) {
        continue;
      }

      imageUrls.set(imageId, url);
      imageUrlCount += 1;
    }

    applyKnownImageUrls();
    setStatus(`Rescanned ${liveConversationRequests.length} live request(s), ${imageUrlCount} image URL(s)`);
    for (const request of liveConversationRequests) {
      readConversationRequest(request);
    }
    render();
  });
}

function exportItems(items: ImageMetadata[]): void {
  if (items.length === 0) {
    setStatus("No metadata selected");
    return;
  }

  const payload = createMetadataExport(items);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chatgpt-image-metadata-${formatTimestampForFilename(payload.exportedAt)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${items.length} item(s)`);
}

function selectedItems(): ImageMetadata[] {
  return [...captured.values()]
    .filter((item) => item.selected)
    .map((item) => stripRawMetadata(item.metadata));
}

function allItems(): ImageMetadata[] {
  return [...captured.values()].map((item) => stripRawMetadata(item.metadata));
}

function formatTimestampForFilename(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function render(): void {
  const items = [...captured.values()].sort((first, second) => {
    const firstTime = Date.parse(first.metadata.createdAt ?? first.metadata.capturedAt);
    const secondTime = Date.parse(second.metadata.createdAt ?? second.metadata.capturedAt);
    return secondTime - firstTime;
  });

  countEl.textContent = String(items.length);
  exportAllButton.disabled = items.length === 0;
  exportSelectedButton.disabled = selectedItems().length === 0;

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty">No captured image metadata yet</div>`;
    return;
  }

  listEl.replaceChildren(...items.map(renderItem));
}

function renderItem(item: CapturedItem): HTMLElement {
  const article = document.createElement("article");
  article.className = "item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.selected;
  checkbox.addEventListener("change", () => {
    item.selected = checkbox.checked;
    render();
  });

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = item.metadata.imageId ?? item.metadata.messageId ?? "metadata item";

  const time = document.createElement("time");
  time.className = "item-time";
  time.textContent = item.metadata.createdAt ? new Date(item.metadata.createdAt).toLocaleString() : "";

  const header = document.createElement("div");
  header.className = "item-header";
  header.append(checkbox, title, time);

  const grid = document.createElement("dl");
  grid.className = "meta-grid";
  appendMeta(grid, "Conversation", item.metadata.conversationId);
  appendMeta(grid, "Message", item.metadata.messageId);
  appendMeta(grid, "Image URL", item.metadata.imageUrl);
  appendMeta(grid, "Prompt", item.metadata.prompt, "prompt");
  appendMeta(grid, "Caption", item.metadata.caption, "caption");

  const badges = document.createElement("div");
  badges.className = "badges";
  for (const reason of item.reasons) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = reason;
    badges.append(badge);
  }

  article.append(header, grid, badges);
  return article;
}

function appendMeta(grid: HTMLElement, label: string, value?: string, valueClass?: string): void {
  if (!value) {
    return;
  }

  const dt = document.createElement("dt");
  dt.className = "meta-label";
  dt.textContent = label;

  const dd = document.createElement("dd");
  dd.className = valueClass ? `meta-value ${valueClass}` : "meta-value";
  dd.textContent = value;

  grid.append(dt, dd);
}

rescanButton.addEventListener("click", rescanHarUrls);
clearButton.addEventListener("click", () => {
  captured.clear();
  liveConversationRequests.length = 0;
  setStatus("Cleared");
  render();
});
exportSelectedButton.addEventListener("click", () => exportItems(selectedItems()));
exportAllButton.addEventListener("click", () => exportItems(allItems()));

chrome.devtools.network.onRequestFinished.addListener(processRequest);
rescanHarUrls();
render();
