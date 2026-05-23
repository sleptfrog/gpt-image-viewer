import { parseChatGptResponse } from "../metadata/parse-chatgpt";
import { parseRecentImageGenResponse } from "../metadata/parse-recent-image-gen";
import type { ImageMetadata } from "../metadata/types";

export type CapturedImageUrlRecord = {
  imageId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  assetPointer?: string;
  recentItemId?: string;
  generationId?: string;
  generationType?: string;
  kind?: string;
  conversationId?: string;
  messageId?: string;
  title?: string;
  caption?: string;
  prompt?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  capturedAt: string;
  source: "recent-image-gen";
};

export function extractCapturedConversationItems(options: {
  body: string;
  responseUrl: string;
  capturedAt: string;
}): { conversationId?: string; conversationTitle?: string; hasConversationMapping: boolean; items: ImageMetadata[] } {
  const result = parseChatGptResponse({
    responseBody: options.body,
    responseUrl: options.responseUrl,
    capturedAt: options.capturedAt
  });

  return {
    conversationId: result.conversationId,
    conversationTitle: result.conversationTitle,
    hasConversationMapping: result.diagnostics.some((diagnostic) => diagnostic.message.startsWith("Parsed ")),
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
      assetPointer: record.assetPointer,
      recentItemId: record.recentItemId,
      generationId: record.generationId,
      generationType: record.generationType,
      kind: record.kind,
      conversationId: record.conversationId,
      messageId: record.messageId,
      title: record.title,
      caption: record.caption,
      prompt: record.prompt,
      width: record.width,
      height: record.height,
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
