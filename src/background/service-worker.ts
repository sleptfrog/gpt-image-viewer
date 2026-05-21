import type { ImageMetadata } from "../metadata/types";
import { stripRawMetadata } from "../metadata/write-metadata";
import { saveCapturedConversation } from "../shared/capture-store";
import type { ImageUrlRecord } from "../shared/image-url-store";
import { saveImageUrlRecords } from "../shared/image-url-store";

type CaptureConversationItemsMessage = {
  type: "gpt-image-viewer:capture-conversation-items";
  payload?: {
    url?: string;
    conversationId?: string;
    capturedAt?: string;
    items?: ImageMetadata[];
  };
};

type CaptureImageUrlRecordsMessage = {
  type: "gpt-image-viewer:capture-image-url-records";
  payload?: {
    url?: string;
    capturedAt?: string;
    records?: ImageUrlRecord[];
  };
};

type CaptureMessage = CaptureConversationItemsMessage | CaptureImageUrlRecordsMessage;

const MAX_ITEMS = 1000;

function enableSidePanelOnActionClick(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.warn("Failed to configure side panel behavior", error);
    });
}

chrome.runtime.onInstalled.addListener(enableSidePanelOnActionClick);
chrome.runtime.onStartup.addListener(enableSidePanelOnActionClick);
enableSidePanelOnActionClick();

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isCaptureMessage(message) || !isChatGptSender(sender)) {
    return false;
  }

  void handleCaptureMessage(message)
    .then((count) => sendResponse({ ok: true, count }))
    .catch((error: unknown) => {
      console.warn("Failed to store captured ChatGPT image data", error);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    });

  return true;
});

async function handleCaptureMessage(message: CaptureMessage): Promise<number> {
  if (message.type === "gpt-image-viewer:capture-image-url-records") {
    const records = message.payload?.records?.filter(isImageUrlRecord) ?? [];
    return saveImageUrlRecords(records.slice(0, MAX_ITEMS));
  }

  const items = message.payload?.items?.filter(isImageMetadata) ?? [];
  const conversationId = message.payload?.conversationId ?? items.find((item) => item.conversationId)?.conversationId;
  if (!conversationId || items.length === 0) {
    return 0;
  }

  await saveCapturedConversation({
    conversationId,
    responseUrl: message.payload?.url,
    capturedAt: message.payload?.capturedAt ?? new Date().toISOString(),
    items: items.slice(0, MAX_ITEMS).map(stripRawMetadata)
  });

  return items.length;
}

function isCaptureMessage(message: unknown): message is CaptureMessage {
  if (!isRecord(message)) {
    return false;
  }

  if (message.type === "gpt-image-viewer:capture-conversation-items") {
    const payload = isRecord(message.payload) ? message.payload : undefined;
    return !!payload && isOptionalSafeChatGptUrl(payload.url) && isOptionalShortString(payload.conversationId) && isOptionalIsoLikeString(payload.capturedAt);
  }

  if (message.type === "gpt-image-viewer:capture-image-url-records") {
    const payload = isRecord(message.payload) ? message.payload : undefined;
    return !!payload && isOptionalSafeChatGptUrl(payload.url) && isOptionalIsoLikeString(payload.capturedAt);
  }

  return false;
}

function isChatGptSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.tab?.url ?? sender.url;
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return isChatGptHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isImageMetadata(value: unknown): value is ImageMetadata {
  if (!isRecord(value) || value.source !== "chatgpt-web" || !isIsoLikeString(value.capturedAt)) {
    return false;
  }

  return (
    isOptionalShortString(value.conversationId) &&
    isOptionalShortString(value.messageId) &&
    isOptionalImageId(value.imageId) &&
    isOptionalSafeChatGptUrl(value.imageUrl) &&
    isOptionalLongString(value.prompt) &&
    isOptionalLongString(value.revisedPrompt) &&
    isOptionalLongString(value.caption) &&
    isOptionalLongString(value.userInput) &&
    isOptionalImageRole(value.imageRole) &&
    isOptionalShortString(value.createdAt)
  );
}

function isImageUrlRecord(value: unknown): value is ImageUrlRecord {
  if (!isRecord(value) || value.source !== "recent-image-gen" || !isImageId(value.imageId) || !isIsoLikeString(value.capturedAt)) {
    return false;
  }

  return (
    isOptionalSafeChatGptUrl(value.imageUrl) &&
    isOptionalSafeChatGptUrl(value.thumbnailUrl) &&
    isOptionalShortString(value.conversationId) &&
    isOptionalShortString(value.messageId) &&
    isOptionalLongString(value.title) &&
    isOptionalLongString(value.prompt) &&
    isOptionalShortString(value.createdAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalShortString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= 512);
}

function isOptionalLongString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= 200_000);
}

function isIsoLikeString(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 64;
}

function isOptionalIsoLikeString(value: unknown): boolean {
  return value === undefined || isIsoLikeString(value);
}

function isImageId(value: unknown): value is string {
  return typeof value === "string" && /^file_[A-Za-z0-9_-]+$/.test(value);
}

function isOptionalImageId(value: unknown): boolean {
  return value === undefined || isImageId(value);
}

function isOptionalImageRole(value: unknown): boolean {
  return value === undefined || value === "generated" || value === "user_attachment" || value === "unknown";
}

function isOptionalSafeChatGptUrl(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "string" || value.length > 5000) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return isChatGptHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}
