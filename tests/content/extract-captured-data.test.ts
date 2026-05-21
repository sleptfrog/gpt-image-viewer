import { describe, expect, it } from "vitest";
import sanitizedConversation from "../fixtures/sanitized-conversation.json";
import sanitizedRecentImageGen from "../fixtures/sanitized-recent-image-gen.json";
import {
  extractCapturedConversationItems,
  extractCapturedImageUrlRecords
} from "../../src/content/extract-captured-data";

describe("content capture extraction", () => {
  it("extracts sanitized conversation metadata without raw response data", () => {
    const result = extractCapturedConversationItems({
      body: JSON.stringify(sanitizedConversation),
      responseUrl: "https://chatgpt.com/backend-api/conversation/conv_sanitized",
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.conversationId).toBe("conv_sanitized");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: "chatgpt-web",
      conversationId: "conv_sanitized",
      messageId: "caption-image-message",
      imageId: "file_sanitized_image_1",
      prompt: "Draw a clean test image with three colored geometric shapes on a white desk.",
      caption: "A clean test image with three colored geometric shapes on a white desk.",
      createdAt: "2023-11-14T22:13:22.000Z",
      capturedAt: "2026-05-19T00:00:00.000Z"
    });
    expect(result.items[0]).not.toHaveProperty("raw");
  });

  it("extracts recent image URL records for the URL dictionary", () => {
    const records = extractCapturedImageUrlRecords({
      body: JSON.stringify(sanitizedRecentImageGen),
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      imageId: "file_recent_image_1",
      imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_image_1&cp=pri&ma=90000&ts=12345&p=igh&cid=1&sig=redacted-image-sig&v=0",
      thumbnailUrl: "https://chatgpt.com/backend-api/estuary/content?id=thumb%23file_recent_image_1%23thumbnail&cp=pri&ma=90000&ts=12345&p=igh&cid=1&sig=redacted-thumb-sig&v=0",
      conversationId: "conv_recent_sanitized",
      messageId: "message_recent_1",
      title: "Sanitized recent image",
      prompt: "A sanitized recent image prompt.",
      createdAt: "2023-11-14T22:16:40.000Z",
      capturedAt: "2026-05-19T00:00:00.000Z",
      source: "recent-image-gen"
    });
  });
});
