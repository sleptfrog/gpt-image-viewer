import type { RecentImageGenUrlRecord } from "../metadata/parse-recent-image-gen";

export type ImageUrlRecord = {
  imageId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  conversationId?: string;
  messageId?: string;
  title?: string;
  prompt?: string;
  createdAt?: string;
  capturedAt: string;
  source: "recent-image-gen" | "page-dom" | "probe";
};

export const IMAGE_URL_RECORDS_KEY = "image-url-records:v1";

export type ImageUrlRecordsExport = {
  schemaVersion: 1;
  exportedAt: string;
  records: ImageUrlRecord[];
};

export async function loadImageUrlRecords(): Promise<Map<string, ImageUrlRecord>> {
  const result = await chrome.storage.session.get(IMAGE_URL_RECORDS_KEY);
  const value = result[IMAGE_URL_RECORDS_KEY];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  const records = new Map<string, ImageUrlRecord>();
  for (const [imageId, record] of Object.entries(value)) {
    if (isImageUrlRecord(record) && imageId === record.imageId) {
      records.set(imageId, record);
    }
  }

  return records;
}

export async function saveImageUrlRecords(records: ImageUrlRecord[]): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  const existing = await loadImageUrlRecords();
  let changed = 0;

  for (const record of records) {
    if (!isImageUrlRecord(record)) {
      continue;
    }

    const current = existing.get(record.imageId);
    const merged = current ? mergeImageUrlRecord(current, record) : record;
    if (JSON.stringify(current) !== JSON.stringify(merged)) {
      changed += 1;
    }
    existing.set(record.imageId, merged);
  }

  if (changed === 0) {
    return 0;
  }

  await chrome.storage.session.set({
    [IMAGE_URL_RECORDS_KEY]: Object.fromEntries(existing)
  });

  return changed;
}

export async function clearImageUrlRecords(): Promise<void> {
  await chrome.storage.session.remove(IMAGE_URL_RECORDS_KEY);
}

export async function createImageUrlRecordsExport(): Promise<ImageUrlRecordsExport> {
  const records = [...(await loadImageUrlRecords()).values()].sort((first, second) =>
    first.imageId.localeCompare(second.imageId)
  );

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records
  };
}

export async function importImageUrlRecords(payload: unknown): Promise<number> {
  const records = parseImageUrlRecordsImport(payload);
  return saveImageUrlRecords(records);
}

export function recentImageGenToImageUrlRecord(record: RecentImageGenUrlRecord): ImageUrlRecord {
  return {
    imageId: record.imageId,
    imageUrl: record.imageUrl,
    thumbnailUrl: record.thumbnailUrl,
    conversationId: record.conversationId,
    messageId: record.messageId,
    title: record.title,
    prompt: record.prompt,
    createdAt: record.createdAt,
    capturedAt: record.capturedAt,
    source: "recent-image-gen"
  };
}

export function mergeImageUrlRecord(existing: ImageUrlRecord, incoming: ImageUrlRecord): ImageUrlRecord {
  const preferIncomingIdentity = imageUrlRecordScore(incoming) >= imageUrlRecordScore(existing);

  return {
    imageId: existing.imageId,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    thumbnailUrl: incoming.thumbnailUrl ?? existing.thumbnailUrl,
    conversationId: incoming.conversationId ?? existing.conversationId,
    messageId: preferIncomingIdentity ? incoming.messageId ?? existing.messageId : existing.messageId ?? incoming.messageId,
    title: incoming.title ?? existing.title,
    prompt: incoming.prompt ?? existing.prompt,
    createdAt: existing.createdAt ?? incoming.createdAt,
    capturedAt: incoming.capturedAt,
    source: imageUrlRecordScore(incoming) >= imageUrlRecordScore(existing) ? incoming.source : existing.source
  };
}

function parseImageUrlRecordsImport(payload: unknown): ImageUrlRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isImageUrlRecord);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as Partial<ImageUrlRecordsExport> & Record<string, unknown>;
  if (Array.isArray(candidate.records)) {
    return candidate.records.filter(isImageUrlRecord);
  }

  return Object.values(candidate).filter(isImageUrlRecord);
}

function imageUrlRecordScore(record: ImageUrlRecord): number {
  return [
    record.imageUrl ? 4 : 0,
    record.thumbnailUrl ? 2 : 0,
    record.title ? 1 : 0,
    record.source === "recent-image-gen" ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function isImageUrlRecord(value: unknown): value is ImageUrlRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ImageUrlRecord>;
  return (
    typeof candidate.imageId === "string" &&
    candidate.imageId.length > 0 &&
    typeof candidate.capturedAt === "string" &&
    (candidate.source === "recent-image-gen" || candidate.source === "page-dom" || candidate.source === "probe")
  );
}
