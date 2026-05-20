import { describe, expect, it } from "vitest";
import { embedImageMetadata } from "../../src/metadata/embed-image-metadata";
import type { ImageMetadata } from "../../src/metadata/types";

const metadata: ImageMetadata = {
  source: "chatgpt-web",
  conversationId: "conversation_1",
  messageId: "message_1",
  imageId: "file_test_image",
  imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_test_image&sig=redacted",
  prompt: "A quiet library with blue lamps",
  caption: "A library scene",
  createdAt: "2026-05-20T00:00:00.000Z",
  capturedAt: "2026-05-20T00:00:01.000Z",
  raw: { secret: "omit me" }
};

describe("embedImageMetadata", () => {
  it("adds UTF-8 iTXt chunks to PNG before IEND", () => {
    const source = createMinimalPng();
    const result = embedImageMetadata(source, metadata);

    expect(result.embedded).toBe(true);
    expect(result.format).toBe("png");
    expect(result.bytes.length).toBeGreaterThan(source.length);
    expect(readPngChunkTypes(result.bytes).slice(-3)).toEqual(["iTXt", "iTXt", "IEND"]);

    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain("gpt-image-viewer:metadata");
    expect(text).toContain("A quiet library with blue lamps");
    expect(text).not.toContain("omit me");
  });

  it("inserts an XMP APP1 segment into JPEG", () => {
    const source = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const result = embedImageMetadata(source, metadata);

    expect(result.embedded).toBe(true);
    expect(result.format).toBe("jpeg");
    expect([...result.bytes.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(new TextDecoder().decode(result.bytes)).toContain("http://ns.adobe.com/xap/1.0/");
  });

  it("appends an XMP chunk to WebP and updates RIFF size", () => {
    const source = createMinimalWebp();
    const result = embedImageMetadata(source, metadata);

    expect(result.embedded).toBe(true);
    expect(result.format).toBe("webp");
    expect(new TextDecoder().decode(result.bytes)).toContain("XMP ");
    expect(readUint32LE(result.bytes, 4)).toBe(result.bytes.length - 8);
  });

  it("reports unsupported formats without changing bytes", () => {
    const source = new Uint8Array([1, 2, 3]);
    const result = embedImageMetadata(source, metadata);

    expect(result.embedded).toBe(false);
    expect(result.reason).toContain("Unsupported");
    expect(result.bytes).toBe(source);
  });
});

function createMinimalPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
}

function createMinimalWebp(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50
  ]);
}

function readPngChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    types.push(type);
    offset += 12 + length;
  }

  return types;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
