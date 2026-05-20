export type RecentImageGenUrlRecord = {
  imageId: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  conversationId?: string;
  messageId?: string;
  title?: string;
  prompt?: string;
  createdAt?: string;
  capturedAt: string;
  source: "recent-image-gen";
};

export type ParseRecentImageGenResult = {
  cursor?: string;
  diagnostics: Array<{ level: "info" | "warning"; message: string }>;
  records: RecentImageGenUrlRecord[];
};

type JsonRecord = Record<string, unknown>;

export function parseRecentImageGenResponse(options: {
  responseBody: string;
  capturedAt?: string;
}): ParseRecentImageGenResult {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const diagnostics: ParseRecentImageGenResult["diagnostics"] = [];
  let document: unknown;

  try {
    document = JSON.parse(options.responseBody) as unknown;
  } catch (error) {
    return {
      diagnostics: [
        {
          level: "warning",
          message: `recent image_gen response is not parseable JSON: ${error instanceof Error ? error.message : "unknown error"}`
        }
      ],
      records: []
    };
  }

  const items = extractItems(document);
  if (!items) {
    return {
      diagnostics: [{ level: "warning", message: "recent image_gen response did not contain an items array" }],
      records: []
    };
  }

  const records = items.flatMap((item) => parseRecentImageGenItem(item, capturedAt));
  if (records.length === 0) {
    diagnostics.push({ level: "info", message: "No image URL records found in recent image_gen response" });
  }

  return {
    cursor: isRecord(document) ? asString(document.cursor) : undefined,
    diagnostics,
    records
  };
}

export function isChatGptRecentImageGenUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supportedHost = parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
    return supportedHost && parsed.pathname === "/backend-api/my/recent/image_gen";
  } catch {
    return false;
  }
}

function parseRecentImageGenItem(item: unknown, capturedAt: string): RecentImageGenUrlRecord[] {
  if (!isRecord(item)) {
    return [];
  }

  const imageUrl = asString(item.url);
  const thumbnailUrl = extractThumbnailUrl(item);
  const imageId = imageIdFromAssetPointer(asString(item.asset_pointer)) ?? imageIdFromEstuaryUrl(imageUrl);

  if (!imageId || (!imageUrl && !thumbnailUrl)) {
    return [];
  }

  return [
    {
      imageId,
      imageUrl,
      thumbnailUrl,
      conversationId: asString(item.conversation_id),
      messageId: asString(item.message_id),
      title: asString(item.title),
      prompt: asString(item.prompt) ?? asString(item.recreation_prompt),
      createdAt: timestampToIso(asNumber(item.created_at)),
      capturedAt,
      source: "recent-image-gen"
    }
  ];
}

function extractItems(document: unknown): unknown[] | undefined {
  if (Array.isArray(document)) {
    return document;
  }

  if (isRecord(document) && Array.isArray(document.items)) {
    return document.items;
  }

  return undefined;
}

function extractThumbnailUrl(item: JsonRecord): string | undefined {
  const encodings = isRecord(item.encodings) ? item.encodings : undefined;
  const thumbnail = isRecord(encodings?.thumbnail) ? encodings.thumbnail : undefined;
  return asString(thumbnail?.path);
}

function imageIdFromAssetPointer(assetPointer: string | undefined): string | undefined {
  if (!assetPointer) {
    return undefined;
  }

  const match = assetPointer.match(/(?:sediment:\/\/)?(file_[A-Za-z0-9_-]+)/);
  return match?.[1];
}

function imageIdFromEstuaryUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    return id?.match(/(file_[A-Za-z0-9_-]+)/)?.[1];
  } catch {
    return undefined;
  }
}

function timestampToIso(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) {
    return undefined;
  }

  const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
