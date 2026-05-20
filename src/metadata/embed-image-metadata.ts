import type { ImageMetadata } from "./types";
import { stripRawMetadata } from "./write-metadata";

export type SupportedImageFormat = "png" | "jpeg" | "webp";

export type EmbeddedImageMetadata = {
  bytes: Uint8Array;
  format?: SupportedImageFormat;
  embedded: boolean;
  reason?: string;
};

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const MAX_JPEG_SEGMENT_PAYLOAD_SIZE = 65533;

const crcTable = createCrcTable();

export function embedImageMetadata(bytes: Uint8Array, metadata: ImageMetadata): EmbeddedImageMetadata {
  const format = detectImageFormat(bytes);
  const safeMetadata = stripRawMetadata(metadata);
  const metadataJson = `${JSON.stringify(createEmbeddedMetadataPayload(safeMetadata), null, 2)}\n`;

  if (format === "png") {
    return {
      bytes: embedPngText(bytes, [
        createPngItxtChunk("gpt-image-viewer:metadata", metadataJson),
        createPngItxtChunk("gpt-image-viewer:prompt", safeMetadata.prompt ?? safeMetadata.caption ?? "")
      ]),
      embedded: true,
      format
    };
  }

  if (format === "jpeg") {
    const xmp = createXmpPacket(safeMetadata);
    const payload = concatBytes(utf8Bytes(XMP_HEADER), utf8Bytes(xmp));
    if (payload.length > MAX_JPEG_SEGMENT_PAYLOAD_SIZE) {
      return { bytes, embedded: false, format, reason: "XMP payload is too large for a JPEG APP1 segment" };
    }

    return {
      bytes: embedJpegApp1(bytes, payload),
      embedded: true,
      format
    };
  }

  if (format === "webp") {
    return {
      bytes: embedWebpXmp(bytes, utf8Bytes(createXmpPacket(safeMetadata))),
      embedded: true,
      format
    };
  }

  return { bytes, embedded: false, reason: "Unsupported image format" };
}

export function detectImageFormat(bytes: Uint8Array): SupportedImageFormat | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "png";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "jpeg";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes.subarray(0, 4)) === "RIFF" &&
    ascii(bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "webp";
  }

  return undefined;
}

function createEmbeddedMetadataPayload(metadata: ImageMetadata): Record<string, unknown> {
  return {
    schema: "https://github.com/local/gpt-image-viewer/embedded-metadata/v1",
    tool: "GPT Image Viewer",
    embeddedAt: new Date().toISOString(),
    metadata
  };
}

function embedPngText(bytes: Uint8Array, chunks: Uint8Array[]): Uint8Array {
  assertPng(bytes);

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    const type = ascii(bytes.subarray(typeOffset, typeOffset + 4));

    if (nextOffset > bytes.length) {
      throw new Error("Invalid PNG chunk length");
    }

    if (type === "IEND") {
      return concatBytes(bytes.subarray(0, offset), ...chunks, bytes.subarray(offset));
    }

    offset = nextOffset;
  }

  throw new Error("PNG IEND chunk not found");
}

function createPngItxtChunk(keyword: string, text: string): Uint8Array {
  const safeKeyword = keyword.replace(/[\0]/g, "").slice(0, 79) || "gpt-image-viewer";
  const data = concatBytes(
    latin1Bytes(safeKeyword),
    new Uint8Array([0, 0, 0, 0, 0]),
    utf8Bytes(text)
  );
  return createPngChunk("iTXt", data);
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = latin1Bytes(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32BE(chunk, 8 + data.length, crc32(concatBytes(typeBytes, data)));
  return chunk;
}

function embedJpegApp1(bytes: Uint8Array, payload: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Invalid JPEG signature");
  }

  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  writeUint16BE(segment, 2, payload.length + 2);
  segment.set(payload, 4);

  return concatBytes(bytes.subarray(0, 2), segment, bytes.subarray(2));
}

function embedWebpXmp(bytes: Uint8Array, xmp: Uint8Array): Uint8Array {
  if (detectImageFormat(bytes) !== "webp") {
    throw new Error("Invalid WebP signature");
  }

  const chunk = createRiffChunk("XMP ", xmp);
  const output = concatBytes(bytes, chunk);
  writeUint32LE(output, 4, output.length - 8);
  return output;
}

function createRiffChunk(type: string, data: Uint8Array): Uint8Array {
  const padding = data.length % 2 === 0 ? 0 : 1;
  const chunk = new Uint8Array(8 + data.length + padding);
  chunk.set(latin1Bytes(type), 0);
  writeUint32LE(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
}

function createXmpPacket(metadata: ImageMetadata): string {
  const description = metadata.prompt ?? metadata.caption ?? metadata.imageId ?? "ChatGPT generated image";
  const serialized = JSON.stringify(createEmbeddedMetadataPayload(metadata));
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:gptis="https://github.com/local/gpt-image-viewer/ns/1.0/">
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(description)}</rdf:li></rdf:Alt></dc:description>
      <gptis:metadata>${escapeXml(serialized)}</gptis:metadata>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function assertPng(bytes: Uint8Array): void {
  if (!startsWith(bytes, PNG_SIGNATURE)) {
    throw new Error("Invalid PNG signature");
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  return prefix.every((value, index) => bytes[index] === value);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function latin1Bytes(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}
