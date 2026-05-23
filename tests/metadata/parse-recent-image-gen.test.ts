import { describe, expect, it } from "vitest";
import sanitizedRecentImageGen from "../fixtures/sanitized-recent-image-gen.json";
import {
  isChatGptRecentImageGenUrl,
  parseRecentImageGenResponse
} from "../../src/metadata/parse-recent-image-gen";

describe("parseRecentImageGenResponse", () => {
  it("extracts file id, signed URLs, thumbnail URLs, and metadata", () => {
    const result = parseRecentImageGenResponse({
      responseBody: JSON.stringify(sanitizedRecentImageGen),
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.cursor).toBe("sanitized-next-cursor");
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      imageId: "file_recent_image_1",
      imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_image_1&cp=pri&ma=90000&ts=12345&p=igh&cid=1&sig=redacted-image-sig&v=0",
      thumbnailUrl: "https://chatgpt.com/backend-api/estuary/content?id=thumb%23file_recent_image_1%23thumbnail&cp=pri&ma=90000&ts=12345&p=igh&cid=1&sig=redacted-thumb-sig&v=0",
      assetPointer: "sediment://file_recent_image_1",
      recentItemId: "s_sanitized_1",
      generationId: "s_sanitized_1",
      generationType: "image_gen",
      kind: "media_generation",
      conversationId: "conv_recent_sanitized",
      messageId: "message_recent_1",
      title: "Sanitized recent image",
      caption: "A sanitized caption from the Images page.",
      prompt: "A sanitized recent image prompt.",
      width: 1448,
      height: 1086,
      createdAt: "2023-11-14T22:16:40.000Z",
      capturedAt: "2026-05-19T00:00:00.000Z",
      source: "recent-image-gen"
    });
  });

  it("falls back to the estuary URL id when asset_pointer is absent", () => {
    const result = parseRecentImageGenResponse({
      responseBody: JSON.stringify(sanitizedRecentImageGen),
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.records[1]).toMatchObject({
      imageId: "file_recent_image_2",
      imageUrl: expect.stringContaining("id=file_recent_image_2")
    });
  });
});

describe("isChatGptRecentImageGenUrl", () => {
  it("matches the supported recent image_gen endpoint", () => {
    expect(isChatGptRecentImageGenUrl("https://chatgpt.com/backend-api/my/recent/image_gen?limit=25")).toBe(true);
    expect(isChatGptRecentImageGenUrl("https://chat.openai.com/backend-api/my/recent/image_gen?limit=25")).toBe(true);
    expect(isChatGptRecentImageGenUrl("https://example.com/backend-api/my/recent/image_gen?limit=25")).toBe(false);
  });
});
