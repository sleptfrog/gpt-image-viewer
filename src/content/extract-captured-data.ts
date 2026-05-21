import { parseChatGptResponse } from "../metadata/parse-chatgpt";
import { parseRecentImageGenResponse } from "../metadata/parse-recent-image-gen";
import type { ImageMetadata } from "../metadata/types";

export type CapturedImageUrlRecord = {
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

export function extractCapturedConversationItems(options: {
  body: string;
  responseUrl: string;
  capturedAt: string;
}): { conversationId?: string; items: ImageMetadata[] } {
  const result = parseChatGptResponse({
    responseBody: options.body,
    responseUrl: options.responseUrl,
    capturedAt: options.capturedAt
  });

  return {
    conversationId: result.conversationId,
    items: result.items.map(stripRaw)
  };
}

export function extractCapturedImageUrlRecords(options: {
  body: string;
  capturedAt: string;
}): CapturedImageUrlRecord[] {
  const result = parseRecentImageGenResponse({
    responseBody: options.body,
    capturedAt: options.capturedAt
  });

  return result.records.map((record) =>
    stripUndefined({
      imageId: record.imageId,
      imageUrl: record.imageUrl,
      thumbnailUrl: record.thumbnailUrl,
      conversationId: record.conversationId,
      messageId: record.messageId,
      title: record.title,
      prompt: record.prompt,
      createdAt: record.createdAt,
      capturedAt: record.capturedAt,
      source: "recent-image-gen"
    })
  );
}

function stripRaw(item: ImageMetadata): ImageMetadata {
  const { raw: _raw, ...safeItem } = item;
  return stripUndefined(safeItem);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
}
