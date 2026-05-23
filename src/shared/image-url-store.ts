import type { RecentImageGenUrlRecord } from "../metadata/parse-recent-image-gen";

export type ImageUrlRecord = {
  imageId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  assetPointer?: string;
  recentItemId?: string;
  generationId?: string;
  generationType?: string;
  kind?: string;
  conversationId?: string;
  messageId?: string;
  title?: string;
  caption?: string;
  prompt?: string;
  width?: number;
  height?: number;
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

export type ImageUrlRecordStats = {
  totalRecordCount: number;
  recentImageGenRecordCount: number;
  recentImageGenLinkedConversationCount: number;
  latestRecentImageGenCapturedAt?: string;
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
    assetPointer: record.assetPointer,
    recentItemId: record.recentItemId,
    generationId: record.generationId,
    generationType: record.generationType,
    kind: record.kind,
    conversationId: record.conversationId,
    messageId: record.messageId,
    title: record.title,
    caption: record.caption,
    prompt: record.prompt,
    width: record.width,
    height: record.height,
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
    assetPointer: incoming.assetPointer ?? existing.assetPointer,
    recentItemId: incoming.recentItemId ?? existing.recentItemId,
    generationId: incoming.generationId ?? existing.generationId,
    generationType: incoming.generationType ?? existing.generationType,
    kind: incoming.kind ?? existing.kind,
    conversationId: incoming.conversationId ?? existing.conversationId,
    messageId: preferIncomingIdentity ? incoming.messageId ?? existing.messageId : existing.messageId ?? incoming.messageId,
    title: incoming.title ?? existing.title,
    caption: incoming.caption ?? existing.caption,
    prompt: incoming.prompt ?? existing.prompt,
    width: incoming.width ?? existing.width,
    height: incoming.height ?? existing.height,
    createdAt: existing.createdAt ?? incoming.createdAt,
    capturedAt: incoming.capturedAt,
    source: imageUrlRecordScore(incoming) >= imageUrlRecordScore(existing) ? incoming.source : existing.source
  };
}

export function getImageUrlRecordStats(records: Iterable<ImageUrlRecord>): ImageUrlRecordStats {
  let totalRecordCount = 0;
  let recentImageGenRecordCount = 0;
  let recentImageGenLinkedConversationCount = 0;
  let latestRecentImageGenCapturedAt: string | undefined;

  for (const record of records) {
    totalRecordCount += 1;
    if (record.source !== "recent-image-gen") {
      continue;
    }

    recentImageGenRecordCount += 1;
    if (record.conversationId) {
      recentImageGenLinkedConversationCount += 1;
    }
    if (!latestRecentImageGenCapturedAt || Date.parse(record.capturedAt) > Date.parse(latestRecentImageGenCapturedAt)) {
      latestRecentImageGenCapturedAt = record.capturedAt;
    }
  }

  return {
    totalRecordCount,
    recentImageGenRecordCount,
    recentImageGenLinkedConversationCount,
    latestRecentImageGenCapturedAt
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
    record.title || record.caption ? 1 : 0,
    record.conversationId ? 1 : 0,
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
