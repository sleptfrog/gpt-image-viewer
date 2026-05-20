import { parseChatGptResponse } from "../metadata/parse-chatgpt";
import { parseRecentImageGenResponse } from "../metadata/parse-recent-image-gen";
import { stripRawMetadata } from "../metadata/write-metadata";
import { saveCapturedConversation } from "../shared/capture-store";
import { recentImageGenToImageUrlRecord, saveImageUrlRecords } from "../shared/image-url-store";

type CaptureConversationMessage = {
  type: "gpt-image-viewer:capture-conversation";
  payload?: {
    url?: string;
    body?: string;
    capturedAt?: string;
  };
};

type CaptureRecentImageGenMessage = {
  type: "gpt-image-viewer:capture-recent-image-gen";
  payload?: {
    url?: string;
    body?: string;
    capturedAt?: string;
  };
};

type CaptureMessage = CaptureConversationMessage | CaptureRecentImageGenMessage;

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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCaptureMessage(message)) {
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
  if (message.type === "gpt-image-viewer:capture-recent-image-gen") {
    return handleCapturedRecentImageGen(message);
  }

  return handleCapturedConversation(message);
}

async function handleCapturedConversation(message: CaptureConversationMessage): Promise<number> {
  const body = message.payload?.body;
  if (!body) {
    return 0;
  }

  const parsed = parseChatGptResponse({
    responseBody: body,
    responseUrl: message.payload?.url,
    capturedAt: message.payload?.capturedAt
  });

  if (!parsed.conversationId || parsed.items.length === 0) {
    return 0;
  }

  await saveCapturedConversation({
    conversationId: parsed.conversationId,
    responseUrl: message.payload?.url,
    capturedAt: message.payload?.capturedAt ?? new Date().toISOString(),
    items: parsed.items.map(stripRawMetadata)
  });

  return parsed.items.length;
}

async function handleCapturedRecentImageGen(message: CaptureRecentImageGenMessage): Promise<number> {
  const body = message.payload?.body;
  if (!body) {
    return 0;
  }

  const parsed = parseRecentImageGenResponse({
    responseBody: body,
    capturedAt: message.payload?.capturedAt
  });
  const records = parsed.records.map(recentImageGenToImageUrlRecord);
  await saveImageUrlRecords(records);
  return records.length;
}

function isCaptureMessage(message: unknown): message is CaptureMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const type = (message as Partial<CaptureMessage>).type;
  return type === "gpt-image-viewer:capture-conversation" || type === "gpt-image-viewer:capture-recent-image-gen";
}
