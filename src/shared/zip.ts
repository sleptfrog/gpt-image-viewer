export type ZipFileEntry = {
  path: string;
  data: Uint8Array;
  modifiedAt?: Date;
};

const ZIP_VERSION_NEEDED = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const DOS_EPOCH = new Date("1980-01-01T00:00:00.000Z");

const crcTable = createCrcTable();

export function createZipArchive(files: ZipFileEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const pathBytes = utf8Bytes(normalizeZipPath(file.path));
    const crc = crc32(file.data);
    const { dosDate, dosTime } = dateToDos(file.modifiedAt ?? new Date());
    const localHeader = createLocalFileHeader(pathBytes, file.data, crc, dosDate, dosTime);
    const centralHeader = createCentralDirectoryHeader(pathBytes, file.data, crc, dosDate, dosTime, localOffset);

    localParts.push(localHeader, file.data);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + file.data.length;
  }

  const centralDirectory = concatBytes(...centralParts);
  const end = createEndOfCentralDirectory(files.length, centralDirectory.length, localOffset);
  return concatBytes(...localParts, centralDirectory, end);
}

export class ZipBlobBuilder {
  private readonly localParts: BlobPart[] = [];
  private readonly centralParts: BlobPart[] = [];
  private localOffset = 0;
  private centralDirectorySize = 0;
  private count = 0;

  get fileCount(): number {
    return this.count;
  }

  addFile(file: ZipFileEntry): void {
    const pathBytes = utf8Bytes(normalizeZipPath(file.path));
    const crc = crc32(file.data);
    const { dosDate, dosTime } = dateToDos(file.modifiedAt ?? new Date());
    const localHeader = createLocalFileHeader(pathBytes, file.data, crc, dosDate, dosTime);
    const centralHeader = createCentralDirectoryHeader(pathBytes, file.data, crc, dosDate, dosTime, this.localOffset);

    this.localParts.push(blobPartFromBytes(localHeader), blobPartFromBytes(file.data));
    this.centralParts.push(blobPartFromBytes(centralHeader));
    this.localOffset += localHeader.length + file.data.length;
    this.centralDirectorySize += centralHeader.length;
    this.count += 1;
  }

  createBlob(): Blob {
    const end = createEndOfCentralDirectory(this.count, this.centralDirectorySize, this.localOffset);
    return new Blob([...this.localParts, ...this.centralParts, blobPartFromBytes(end)], { type: "application/zip" });
  }
}

function createLocalFileHeader(
  pathBytes: Uint8Array,
  data: Uint8Array,
  crc: number,
  dosDate: number,
  dosTime: number
): Uint8Array {
  const header = new Uint8Array(30 + pathBytes.length);
  writeUint32LE(header, 0, 0x04034b50);
  writeUint16LE(header, 4, ZIP_VERSION_NEEDED);
  writeUint16LE(header, 6, ZIP_UTF8_FLAG);
  writeUint16LE(header, 8, ZIP_STORE_METHOD);
  writeUint16LE(header, 10, dosTime);
  writeUint16LE(header, 12, dosDate);
  writeUint32LE(header, 14, crc);
  writeUint32LE(header, 18, data.length);
  writeUint32LE(header, 22, data.length);
  writeUint16LE(header, 26, pathBytes.length);
  writeUint16LE(header, 28, 0);
  header.set(pathBytes, 30);
  return header;
}

function createCentralDirectoryHeader(
  pathBytes: Uint8Array,
  data: Uint8Array,
  crc: number,
  dosDate: number,
  dosTime: number,
  localOffset: number
): Uint8Array {
  const header = new Uint8Array(46 + pathBytes.length);
  writeUint32LE(header, 0, 0x02014b50);
  writeUint16LE(header, 4, ZIP_VERSION_NEEDED);
  writeUint16LE(header, 6, ZIP_VERSION_NEEDED);
  writeUint16LE(header, 8, ZIP_UTF8_FLAG);
  writeUint16LE(header, 10, ZIP_STORE_METHOD);
  writeUint16LE(header, 12, dosTime);
  writeUint16LE(header, 14, dosDate);
  writeUint32LE(header, 16, crc);
  writeUint32LE(header, 20, data.length);
  writeUint32LE(header, 24, data.length);
  writeUint16LE(header, 28, pathBytes.length);
  writeUint16LE(header, 30, 0);
  writeUint16LE(header, 32, 0);
  writeUint16LE(header, 34, 0);
  writeUint16LE(header, 36, 0);
  writeUint32LE(header, 38, 0);
  writeUint32LE(header, 42, localOffset);
  header.set(pathBytes, 46);
  return header;
}

function createEndOfCentralDirectory(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const end = new Uint8Array(22);
  writeUint32LE(end, 0, 0x06054b50);
  writeUint16LE(end, 4, 0);
  writeUint16LE(end, 6, 0);
  writeUint16LE(end, 8, fileCount);
  writeUint16LE(end, 10, fileCount);
  writeUint32LE(end, 12, centralDirectorySize);
  writeUint32LE(end, 16, centralDirectoryOffset);
  writeUint16LE(end, 20, 0);
  return end;
}

function normalizeZipPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/") || "file";
}

function dateToDos(date: Date): { dosDate: number; dosTime: number } {
  const safeDate = date < DOS_EPOCH ? DOS_EPOCH : date;
  const year = safeDate.getFullYear();
  const month = safeDate.getMonth() + 1;
  const day = safeDate.getDate();
  const hours = safeDate.getHours();
  const minutes = safeDate.getMinutes();
  const seconds = Math.floor(safeDate.getSeconds() / 2);

  return {
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
    dosTime: (hours << 11) | (minutes << 5) | seconds
  };
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
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

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
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

function blobPartFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}
