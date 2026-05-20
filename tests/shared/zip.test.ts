import { describe, expect, it } from "vitest";
import { createZipArchive } from "../../src/shared/zip";

describe("createZipArchive", () => {
  it("creates a stored ZIP archive with central directory entries", () => {
    const zip = createZipArchive([
      {
        path: "images/first.txt",
        data: new TextEncoder().encode("hello"),
        modifiedAt: new Date("2026-05-20T00:00:00")
      },
      {
        path: "metadata/second.json",
        data: new TextEncoder().encode('{"ok":true}'),
        modifiedAt: new Date("2026-05-20T00:00:00")
      }
    ]);

    expect(readUint32LE(zip, 0)).toBe(0x04034b50);
    expect(new TextDecoder().decode(zip)).toContain("images/first.txt");
    expect(new TextDecoder().decode(zip)).toContain("metadata/second.json");
    expect(countSignature(zip, 0x02014b50)).toBe(2);

    const endOffset = zip.length - 22;
    expect(readUint32LE(zip, endOffset)).toBe(0x06054b50);
    expect(readUint16LE(zip, endOffset + 8)).toBe(2);
    expect(readUint16LE(zip, endOffset + 10)).toBe(2);
  });

  it("normalizes unsafe empty path segments", () => {
    const zip = createZipArchive([{ path: "//nested\\file.txt", data: new Uint8Array([1]) }]);
    expect(new TextDecoder().decode(zip)).toContain("nested/file.txt");
  });
});

function countSignature(bytes: Uint8Array, signature: number): number {
  let count = 0;
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (readUint32LE(bytes, offset) === signature) {
      count += 1;
    }
  }
  return count;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
