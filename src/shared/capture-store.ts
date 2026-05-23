import type { ImageMetadata } from "../metadata/types";
import { stripRawMetadata } from "../metadata/write-metadata";

export type CapturedConversationSnapshot = {
  conversationId: string;
  conversationTitle?: string;
  responseUrl?: string;
  capturedAt: string;
  items: ImageMetadata[];
};

export function capturedConversationKey(conversationId: string): string {
  return `captured-conversation:${conversationId}`;
}

export async function saveCapturedConversation(snapshot: CapturedConversationSnapshot): Promise<void> {
  const safeSnapshot: CapturedConversationSnapshot = {
    ...snapshot,
    items: snapshot.items.map(stripRawMetadata)
  };

  await chrome.storage.session.set({
    [capturedConversationKey(snapshot.conversationId)]: safeSnapshot
  });
}

export async function loadCapturedConversation(
  conversationId: string
): Promise<CapturedConversationSnapshot | undefined> {
  const key = capturedConversationKey(conversationId);
  const result = await chrome.storage.session.get(key);
  const value = result[key];

  if (!isCapturedConversationSnapshot(value)) {
    return undefined;
  }

  return value;
}

function isCapturedConversationSnapshot(value: unknown): value is CapturedConversationSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CapturedConversationSnapshot>;
  return (
    typeof candidate.conversationId === "string" &&
    typeof candidate.capturedAt === "string" &&
    Array.isArray(candidate.items)
  );
}
