import { describe, expect, it } from "vitest";
import { getImageUrlRecordStats, mergeImageUrlRecord, type ImageUrlRecord } from "../../src/shared/image-url-store";

describe("image URL record helpers", () => {
  it("summarizes recent image_gen import state", () => {
    const records: ImageUrlRecord[] = [
      {
        imageId: "file_recent_1",
        imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_1",
        conversationId: "conv_1",
        capturedAt: "2026-05-20T00:00:00.000Z",
        source: "recent-image-gen"
      },
      {
        imageId: "file_recent_2",
        imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_2",
        capturedAt: "2026-05-21T00:00:00.000Z",
        source: "recent-image-gen"
      },
      {
        imageId: "file_dom_1",
        imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_dom_1",
        capturedAt: "2026-05-22T00:00:00.000Z",
        source: "page-dom"
      }
    ];

    expect(getImageUrlRecordStats(records)).toEqual({
      totalRecordCount: 3,
      recentImageGenRecordCount: 2,
      recentImageGenLinkedConversationCount: 1,
      latestRecentImageGenCapturedAt: "2026-05-21T00:00:00.000Z"
    });
  });

  it("keeps richer recent image metadata when merging records", () => {
    const merged = mergeImageUrlRecord(
      {
        imageId: "file_recent_1",
        imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_1",
        capturedAt: "2026-05-20T00:00:00.000Z",
        source: "page-dom"
      },
      {
        imageId: "file_recent_1",
        thumbnailUrl: "https://chatgpt.com/backend-api/estuary/content?id=thumb%23file_recent_1%23thumbnail",
        assetPointer: "sediment://file_recent_1",
        recentItemId: "recent_1",
        generationId: "generation_1",
        generationType: "image_gen",
        kind: "media_generation",
        conversationId: "conv_1",
        messageId: "message_1",
        title: "Recent title",
        caption: "Recent caption",
        prompt: "Recent prompt",
        width: 1024,
        height: 768,
        capturedAt: "2026-05-21T00:00:00.000Z",
        source: "recent-image-gen"
      }
    );

    expect(merged).toMatchObject({
      imageId: "file_recent_1",
      imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_recent_1",
      thumbnailUrl: "https://chatgpt.com/backend-api/estuary/content?id=thumb%23file_recent_1%23thumbnail",
      assetPointer: "sediment://file_recent_1",
      recentItemId: "recent_1",
      generationId: "generation_1",
      conversationId: "conv_1",
      messageId: "message_1",
      caption: "Recent caption",
      width: 1024,
      height: 768,
      source: "recent-image-gen"
    });
  });
});
