import type { ImageMetadata } from "../metadata/types";
export type WritableFileLike = {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
};

export type FileHandleLike = {
  createWritable(): Promise<WritableFileLike>;
};

export type DirectoryHandleLike = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
};

export type PreparedFolderFile = {
  path: string;
  data: Uint8Array;
  type?: string;
};

export type FolderSaveFailure = {
  imageId?: string;
  conversationId?: string;
  messageId?: string;
  folder?: string;
  filename?: string;
  reason: string;
};

export type FolderSaveFailureReport = {
  schemaVersion: 1;
  generatedAt: string;
  failures: FolderSaveFailure[];
};

export function createFolderSaveRootName(iso: string, timeZone: "utc" | "jst" = "utc"): string {
  return sanitizeFileSystemName(`GPT Image Viewer ${formatTimestampForFolder(iso, timeZone)}`) || "GPT Image Viewer";
}

export function createChatFolderName(
  item: Pick<ImageMetadata, "conversationId">,
  conversationTitles: ReadonlyMap<string, string>
): string {
  if (!item.conversationId) {
    return "chat-unknown";
  }

  const title = conversationTitles.get(item.conversationId);
  const identity = title ? `${title}-${item.conversationId.slice(0, 8)}` : `chat-${item.conversationId}`;
  return sanitizeFileSystemName(identity).slice(0, 120) || "chat-unknown";
}

export function sanitizeFileSystemName(value: string): string {
  return value
    .replace(/[<>:"/\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

export async function getUniqueDirectoryHandle(parent: DirectoryHandleLike, baseName: string): Promise<{ handle: DirectoryHandleLike; name: string }> {
  return getUniqueHandle(
    baseName,
    (name) => parent.getDirectoryHandle(name),
    (name) => parent.getDirectoryHandle(name, { create: true })
  );
}

export async function getUniqueFileHandle(parent: DirectoryHandleLike, baseName: string): Promise<{ handle: FileHandleLike; name: string }> {
  return getUniqueHandle(
    baseName,
    (name) => parent.getFileHandle(name),
    (name) => parent.getFileHandle(name, { create: true })
  );
}

export async function writeFile(handle: FileHandleLike, file: PreparedFolderFile): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([blobPartFromBytes(file.data)], { type: file.type ?? "application/octet-stream" }));
  } finally {
    await writable.close();
  }
}

export function createFolderSaveFailure(
  item: ImageMetadata,
  reason: string,
  details: { folder?: string; filename?: string } = {}
): FolderSaveFailure {
  return {
    imageId: item.imageId,
    conversationId: item.conversationId,
    messageId: item.messageId,
    folder: details.folder,
    filename: details.filename,
    reason
  };
}

export function createFolderSaveFailureReport(failures: FolderSaveFailure[], generatedAt: string): FolderSaveFailureReport {
  return {
    schemaVersion: 1,
    generatedAt,
    failures
  };
}

export function createFailureReportJson(report: FolderSaveFailureReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function getUniqueHandle<T>(
  baseName: string,
  getExisting: (name: string) => Promise<T>,
  create: (name: string) => Promise<T>
): Promise<{ handle: T; name: string }> {
  const safeBaseName = sanitizeFileSystemName(baseName) || "file";
  for (let index = 1; index < 10_000; index += 1) {
    const name = index === 1 ? safeBaseName : appendSuffix(safeBaseName, index);
    if (await entryExists(name, getExisting)) {
      continue;
    }

    return { handle: await create(name), name };
  }

  throw new Error(`Could not create a unique name for ${safeBaseName}.`);
}

async function entryExists<T>(name: string, getExisting: (name: string) => Promise<T>): Promise<boolean> {
  try {
    await getExisting(name);
    return true;
  } catch (error) {
    if (isMissingEntryError(error)) {
      return false;
    }
    throw error;
  }
}

function appendSuffix(name: string, index: number): string {
  const suffix = `-${index}`;
  return name.replace(/(\.[^./]+)?$/, `${suffix}$1`);
}

function isMissingEntryError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function formatTimestampForFolder(iso: string, timeZone: "utc" | "jst"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  }

  const offsetMs = timeZone === "jst" ? 9 * 60 * 60 * 1000 : 0;
  const shifted = new Date(date.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  const seconds = pad2(shifted.getUTCSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function blobPartFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}
