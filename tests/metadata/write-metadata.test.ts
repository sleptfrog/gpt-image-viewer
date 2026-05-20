import { describe, expect, it } from "vitest";
import { createMetadataExport } from "../../src/metadata/write-metadata";
import type { ImageMetadata } from "../../src/metadata/types";

describe("createMetadataExport", () => {
  it("omits raw response data from exported metadata", () => {
    const item: ImageMetadata = {
      source: "chatgpt-web",
      conversationId: "conv_sanitized",
      imageId: "file_sanitized_image_1",
      prompt: "Sanitized prompt",
      capturedAt: "2026-05-19T00:00:00.000Z",
      raw: { secret: "do not export" }
    };

    const exported = createMetadataExport([item], "2026-05-19T01:02:03.000Z");

    expect(exported).toEqual({
      schemaVersion: 1,
      exportedAt: "2026-05-19T01:02:03.000Z",
      items: [
        {
          source: "chatgpt-web",
          conversationId: "conv_sanitized",
          imageId: "file_sanitized_image_1",
          prompt: "Sanitized prompt",
          capturedAt: "2026-05-19T00:00:00.000Z"
        }
      ]
    });
  });
});
