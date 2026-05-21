(() => {
type ImageMetadataMessageItem = {
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
};

type ImageUrlMessageRecord = {
  imageId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  conversationId?: string;
  messageId?: string;
  title?: string;
  prompt?: string;
  createdAt?: string;
  capturedAt: string;
  source: "recent-image-gen";
};

type PageHookMessage = {
  source: "gpt-image-viewer-page-hook";
  version: 1;
  type: "conversation-items" | "image-url-records";
  url?: string;
  capturedAt: string;
  conversationId?: string;
  items?: ImageMetadataMessageItem[];
  records?: ImageUrlMessageRecord[];
};

const PAGE_SOURCE = "gpt-image-viewer-page-hook";
const MAX_ITEMS = 1000;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== location.origin) {
    return;
  }

  const data = event.data;
  if (!isPageHookMessage(data)) {
    return;
  }

  const message =
    data.type === "conversation-items"
      ? {
          type: "gpt-image-viewer:capture-conversation-items",
          payload: {
            url: data.url,
            conversationId: data.conversationId,
            capturedAt: data.capturedAt,
            items: data.items
          }
        }
      : {
          type: "gpt-image-viewer:capture-image-url-records",
          payload: {
            url: data.url,
            capturedAt: data.capturedAt,
            records: data.records
          }
        };

  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === "function") {
      result.catch(() => undefined);
    }
  } catch {
    // The extension may be reloading while the page is still alive.
  }
});

function isPageHookMessage(value: unknown): value is PageHookMessage {
  if (!isRecord(value) || value.source !== PAGE_SOURCE || value.version !== 1) {
    return false;
  }

  if (!isSafeUrl(value.url) || !isIsoLikeString(value.capturedAt)) {
    return false;
  }

  if (value.type === "conversation-items") {
    return (
      isOptionalShortString(value.conversationId) &&
      Array.isArray(value.items) &&
      value.items.length <= MAX_ITEMS &&
      value.items.every(isImageMetadataMessageItem)
    );
  }

  if (value.type === "image-url-records") {
    return (
      Array.isArray(value.records) &&
      value.records.length <= MAX_ITEMS &&
      value.records.every(isImageUrlMessageRecord)
    );
  }

  return false;
}

function isImageMetadataMessageItem(value: unknown): value is ImageMetadataMessageItem {
  if (!isRecord(value) || value.source !== "chatgpt-web" || !isIsoLikeString(value.capturedAt)) {
    return false;
  }

  return (
    isOptionalShortString(value.conversationId) &&
    isOptionalShortString(value.messageId) &&
    isOptionalImageId(value.imageId) &&
    isOptionalSafeUrl(value.imageUrl) &&
    isOptionalLongString(value.prompt) &&
    isOptionalLongString(value.revisedPrompt) &&
    isOptionalLongString(value.caption) &&
    isOptionalLongString(value.userInput) &&
    isOptionalImageRole(value.imageRole) &&
    isOptionalShortString(value.createdAt)
  );
}

function isImageUrlMessageRecord(value: unknown): value is ImageUrlMessageRecord {
  if (!isRecord(value) || value.source !== "recent-image-gen" || !isImageId(value.imageId) || !isIsoLikeString(value.capturedAt)) {
    return false;
  }

  return (
    isOptionalSafeUrl(value.imageUrl) &&
    isOptionalSafeUrl(value.thumbnailUrl) &&
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

function isIsoLikeString(value: unknown): boolean {
  return typeof value === "string" && value.length >= 10 && value.length <= 64;
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

function isSafeUrl(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "string" || value.length > 5000) {
    return false;
  }

  try {
    const parsed = new URL(value, location.href);
    return isChatGptHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isOptionalSafeUrl(value: unknown): boolean {
  return value === undefined || isSafeUrl(value);
}

function isChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}
})();
