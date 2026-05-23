import type {
  ImageMetadata,
  ParseChatGptOptions,
  ParseChatGptResult,
  ParseDiagnostic
} from "./types";

type JsonRecord = Record<string, unknown>;

type ConversationNode = {
  nodeId: string;
  parent?: string;
  children: string[];
  message?: JsonRecord;
};

type PromptCandidate = {
  nodeId: string;
  messageId?: string;
  prompt?: string;
  revisedPrompt?: string;
  createdAt?: string;
  createTime?: number;
};

type UserInputCandidate = {
  nodeId: string;
  messageId?: string;
  userInput: string;
  createdAt?: string;
  createTime?: number;
};

type ImageCandidate = {
  item: ImageMetadata;
  nodeId: string;
  createTime?: number;
};

export function parseChatGptResponse(options: ParseChatGptOptions): ParseChatGptResult {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const diagnostics: ParseDiagnostic[] = [];
  const documents = parseResponseDocuments(options.responseBody, diagnostics);

  if (documents.length === 0) {
    return {
      diagnostics: diagnostics.length > 0 ? diagnostics : [{ level: "warning", message: "No JSON payload found" }],
      items: []
    };
  }

  const merged = new Map<string, ImageMetadata>();
  let conversationId = extractConversationIdFromUrl(options.responseUrl);
  let conversationTitle: string | undefined;

  for (const document of documents) {
    const result = parseJsonDocument(document, {
      capturedAt,
      responseUrl: options.responseUrl,
      imageUrls: normalizeImageUrlMap(options.imageUrls)
    });

    conversationId = result.conversationId ?? conversationId;
    conversationTitle = result.conversationTitle ?? conversationTitle;
    diagnostics.push(...result.diagnostics);

    for (const item of result.items) {
      const key = item.imageId ?? item.messageId ?? `${item.conversationId ?? "unknown"}:${item.capturedAt}`;
      const existing = merged.get(key);
      merged.set(key, existing ? mergeMetadata(existing, item) : item);
    }
  }

  if (merged.size === 0) {
    diagnostics.push({ level: "info", message: "No image metadata found in candidate response" });
  }

  return {
    conversationId,
    conversationTitle,
    diagnostics,
    items: [...merged.values()]
  };
}

export function isChatGptConversationUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  return isChatGptHost(parsed.hostname) && /^\/backend-api\/conversation\/[^/?#]+/.test(parsed.pathname);
}

export function isChatGptEstuaryContentUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  return isChatGptHost(parsed.hostname) && parsed.pathname === "/backend-api/estuary/content" && parsed.searchParams.has("id");
}

export function extractEstuaryImageId(url: string): string | undefined {
  const parsed = parseUrl(url);
  return parsed?.searchParams.get("id") ?? undefined;
}

function parseResponseDocuments(body: string, diagnostics: ParseDiagnostic[]): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  if (looksLikeSse(trimmed)) {
    return parseSseDocuments(trimmed, diagnostics);
  }

  try {
    return [JSON.parse(trimmed) as unknown];
  } catch (error) {
    diagnostics.push({
      level: "warning",
      message: `Response body is not parseable JSON: ${error instanceof Error ? error.message : "unknown error"}`
    });
    return [];
  }
}

function looksLikeSse(body: string): boolean {
  return body.startsWith("data:") || body.includes("\ndata:");
}

function parseSseDocuments(body: string, diagnostics: ParseDiagnostic[]): unknown[] {
  const documents: unknown[] = [];

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      documents.push(JSON.parse(payload) as unknown);
    } catch {
      diagnostics.push({ level: "warning", message: "Skipped an unparseable SSE data line" });
    }
  }

  return documents;
}

function parseJsonDocument(
  document: unknown,
  context: {
    capturedAt: string;
    responseUrl?: string;
    imageUrls: ReadonlyMap<string, string>;
  }
): ParseChatGptResult {
  const diagnostics: ParseDiagnostic[] = [];
  const conversationDocument = findConversationDocument(document);

  if (conversationDocument) {
    return parseConversationDocument(conversationDocument, context);
  }

  diagnostics.push({ level: "info", message: "JSON payload did not match the conversation mapping shape" });
  return {
    diagnostics,
    items: parseLooseImageMetadata(document, context)
  };
}

function findConversationDocument(document: unknown): JsonRecord | undefined {
  if (!isRecord(document)) {
    return undefined;
  }

  if (isRecord(document.mapping)) {
    return document;
  }

  if (isRecord(document.conversation) && isRecord(document.conversation.mapping)) {
    return document.conversation;
  }

  if (isRecord(document.data) && isRecord(document.data.mapping)) {
    return document.data;
  }

  return undefined;
}

function parseConversationDocument(
  document: JsonRecord,
  context: {
    capturedAt: string;
    responseUrl?: string;
    imageUrls: ReadonlyMap<string, string>;
  }
): ParseChatGptResult {
  const conversationId = asString(document.conversation_id) ?? extractConversationIdFromUrl(context.responseUrl);
  const conversationTitle = extractConversationTitle(document);
  const nodes = normalizeConversationNodes(document.mapping);
  const promptCandidates = collectPromptCandidates(nodes);
  const userInputCandidates = collectUserInputCandidates(nodes);
  const imageCandidates = collectImageCandidates(nodes, {
    capturedAt: context.capturedAt,
    conversationId,
    imageUrls: context.imageUrls,
    promptCandidates,
    userInputCandidates
  });

  const merged = new Map<string, ImageMetadata>();
  for (const candidate of imageCandidates) {
    const key = candidate.item.imageId ?? candidate.item.messageId ?? candidate.nodeId;
    const existing = merged.get(key);
    merged.set(key, existing ? mergeMetadata(existing, candidate.item) : candidate.item);
  }

  return {
    conversationId,
    conversationTitle,
    diagnostics: [{ level: "info", message: `Parsed ${nodes.size} conversation node(s)` }],
    items: [...merged.values()]
  };
}


function extractConversationTitle(document: JsonRecord): string | undefined {
  return asString(document.title) ?? asString(document.name) ?? asString(document.conversation_title);
}

function normalizeConversationNodes(mapping: unknown): Map<string, ConversationNode> {
  const nodes = new Map<string, ConversationNode>();
  if (!isRecord(mapping)) {
    return nodes;
  }

  for (const [nodeId, value] of Object.entries(mapping)) {
    if (!isRecord(value)) {
      continue;
    }

    nodes.set(nodeId, {
      nodeId,
      parent: asString(value.parent),
      children: asStringArray(value.children),
      message: isRecord(value.message) ? value.message : undefined
    });
  }

  return nodes;
}

function collectPromptCandidates(nodes: Map<string, ConversationNode>): PromptCandidate[] {
  const candidates: PromptCandidate[] = [];

  for (const node of nodes.values()) {
    if (!node.message) {
      continue;
    }

    const prompt = extractPromptFromMessage(node.message);
    if (!prompt.prompt && !prompt.revisedPrompt) {
      continue;
    }

    const createTime = asNumber(node.message.create_time);
    candidates.push({
      nodeId: node.nodeId,
      messageId: asString(node.message.id),
      prompt: prompt.prompt,
      revisedPrompt: prompt.revisedPrompt,
      createTime,
      createdAt: timestampToIso(createTime)
    });
  }

  return candidates;
}

function collectUserInputCandidates(nodes: Map<string, ConversationNode>): UserInputCandidate[] {
  const candidates: UserInputCandidate[] = [];

  for (const node of nodes.values()) {
    if (!node.message || getAuthorRole(node.message) !== "user") {
      continue;
    }

    const userInput = extractUserInputFromMessage(node.message);
    if (!userInput) {
      continue;
    }

    const createTime = asNumber(node.message.create_time);
    candidates.push({
      nodeId: node.nodeId,
      messageId: asString(node.message.id),
      userInput,
      createTime,
      createdAt: timestampToIso(createTime)
    });
  }

  return candidates;
}

function collectImageCandidates(
  nodes: Map<string, ConversationNode>,
  context: {
    capturedAt: string;
    conversationId?: string;
    imageUrls: ReadonlyMap<string, string>;
    promptCandidates: PromptCandidate[];
    userInputCandidates: UserInputCandidate[];
  }
): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];

  for (const node of nodes.values()) {
    if (!node.message) {
      continue;
    }

    const imageIds = extractImageIdsFromMessage(node.message);
    if (imageIds.length === 0) {
      continue;
    }

    const messageId = asString(node.message.id);
    const createTime = asNumber(node.message.create_time);
    const prompt = findPromptForNode(node, nodes, context.promptCandidates, createTime);
    const caption = extractCaptionFromMessage(node.message);
    const userInput = findUserInputForNode(node, nodes, context.userInputCandidates, createTime);
    const imageRole = classifyImageRole(node.message, prompt, caption);

    for (const imageId of imageIds) {
      candidates.push({
        nodeId: node.nodeId,
        createTime,
        item: {
          source: "chatgpt-web",
          conversationId: context.conversationId,
          messageId: prompt?.messageId && !messageId ? prompt.messageId : messageId,
          imageId,
          imageUrl: context.imageUrls.get(imageId),
          prompt: prompt?.prompt,
          revisedPrompt: prompt?.revisedPrompt,
          caption,
          userInput: userInput?.userInput,
          imageRole,
          createdAt: timestampToIso(createTime) ?? prompt?.createdAt,
          capturedAt: context.capturedAt
        }
      });
    }
  }

  return candidates;
}

function findUserInputForNode(
  node: ConversationNode,
  nodes: Map<string, ConversationNode>,
  userInputs: UserInputCandidate[],
  imageCreateTime?: number
): UserInputCandidate | undefined {
  const byNodeId = new Map(userInputs.map((userInput) => [userInput.nodeId, userInput]));
  let current: ConversationNode | undefined = node;

  for (let depth = 0; current && depth < 20; depth += 1) {
    const directInput = byNodeId.get(current.nodeId);
    if (directInput) {
      return directInput;
    }

    current = current.parent ? nodes.get(current.parent) : undefined;
  }

  if (imageCreateTime === undefined || userInputs.length === 0) {
    return undefined;
  }

  let bestInput: UserInputCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const userInput of userInputs) {
    if (userInput.createTime === undefined || userInput.createTime > imageCreateTime) {
      continue;
    }

    const distance = imageCreateTime - userInput.createTime;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestInput = userInput;
    }
  }

  return bestInput;
}

function findPromptForNode(
  node: ConversationNode,
  nodes: Map<string, ConversationNode>,
  prompts: PromptCandidate[],
  imageCreateTime?: number
): PromptCandidate | undefined {
  const byNodeId = new Map(prompts.map((prompt) => [prompt.nodeId, prompt]));
  let current: ConversationNode | undefined = node;

  for (let depth = 0; current && depth < 10; depth += 1) {
    const directPrompt = byNodeId.get(current.nodeId);
    if (directPrompt) {
      return directPrompt;
    }

    current = current.parent ? nodes.get(current.parent) : undefined;
  }

  if (imageCreateTime === undefined || prompts.length === 0) {
    return undefined;
  }

  let bestPrompt: PromptCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const prompt of prompts) {
    if (prompt.createTime === undefined) {
      continue;
    }

    const distance = Math.abs(prompt.createTime - imageCreateTime);
    if (distance <= 300 && distance < bestDistance) {
      bestDistance = distance;
      bestPrompt = prompt;
    }
  }

  return bestPrompt;
}

function extractPromptFromMessage(message: JsonRecord): Pick<PromptCandidate, "prompt" | "revisedPrompt"> {
  const content = isRecord(message.content) ? message.content : undefined;
  const text = asString(content?.text);
  const contentType = asString(content?.content_type);

  if (text && contentType === "code") {
    const parsed = parsePromptJsonText(text);
    if (parsed.prompt || parsed.revisedPrompt) {
      return parsed;
    }
  }

  return {};
}

function extractUserInputFromMessage(message: JsonRecord): string | undefined {
  const content = isRecord(message.content) ? message.content : undefined;
  const texts = collectUserMessageTexts(content).map(normalizeText).filter((text) => text.length > 0);
  return dedupeStrings(texts).join("\n\n") || undefined;
}

function collectUserMessageTexts(content: JsonRecord | undefined): string[] {
  const texts: string[] = [];
  const contentText = asString(content?.text);
  if (contentText) {
    texts.push(contentText);
  }

  const parts = Array.isArray(content?.parts) ? content.parts : [];
  for (const part of parts) {
    if (typeof part === "string") {
      texts.push(part);
      continue;
    }

    if (!isRecord(part) || asString(part.content_type) === "image_asset_pointer") {
      continue;
    }

    const text = asString(part.text) ?? asString(part.content) ?? asString(part.value);
    if (text) {
      texts.push(text);
    }
  }

  return texts;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function classifyImageRole(
  message: JsonRecord,
  prompt: PromptCandidate | undefined,
  caption: string | undefined
): ImageMetadata["imageRole"] {
  const role = getAuthorRole(message);
  if (role === "user") {
    return "user_attachment";
  }

  if (role === "tool" || role === "assistant") {
    return "generated";
  }

  return prompt?.prompt || prompt?.revisedPrompt || caption ? "generated" : "unknown";
}

function getAuthorRole(message: JsonRecord): string | undefined {
  const author = isRecord(message.author) ? message.author : undefined;
  return asString(author?.role);
}

function parsePromptJsonText(text: string): Pick<PromptCandidate, "prompt" | "revisedPrompt"> {
  const trimmed = stripCodeFence(text.trim());
  const jsonText = extractJsonObjectText(trimmed);
  if (!jsonText) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    return {
      prompt: asString(parsed.prompt),
      revisedPrompt:
        asString(parsed.revisedPrompt) ??
        asString(parsed.revised_prompt) ??
        asString(parsed.revised_prompt_text)
    };
  } catch {
    return {};
  }
}

function stripCodeFence(text: string): string {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

function extractJsonObjectText(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }

  return text.slice(start, end + 1);
}

function extractImageIdsFromMessage(message: JsonRecord): string[] {
  const content = isRecord(message.content) ? message.content : undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const ids = new Set<string>();

  for (const part of parts) {
    if (!isRecord(part)) {
      continue;
    }

    if (asString(part.content_type) === "image_asset_pointer") {
      addImageIdsFromString(ids, asString(part.asset_pointer));
    }
  }

  walkUnknown(message, (value) => {
    if (typeof value === "string") {
      addImageIdsFromString(ids, value);
    }
  });

  return [...ids];
}

function extractCaptionFromMessage(message: JsonRecord): string | undefined {
  const content = isRecord(message.content) ? message.content : undefined;
  const texts = collectMessageTexts(content);

  for (const text of texts) {
    const caption = extractModelCaption(text);
    if (caption) {
      return caption;
    }
  }

  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  return asString(metadata?.image_gen_title);
}

function collectMessageTexts(content: JsonRecord | undefined): string[] {
  const texts: string[] = [];
  const contentText = asString(content?.text);
  if (contentText) {
    texts.push(contentText);
  }

  const parts = Array.isArray(content?.parts) ? content.parts : [];
  for (const part of parts) {
    if (typeof part === "string") {
      texts.push(part);
    }
  }

  return texts;
}

function extractModelCaption(text: string): string | undefined {
  const match = text.match(/Model caption:\s*([\s\S]+)/i);
  return match?.[1]?.trim();
}

function parseLooseImageMetadata(
  document: unknown,
  context: {
    capturedAt: string;
    responseUrl?: string;
    imageUrls: ReadonlyMap<string, string>;
  }
): ImageMetadata[] {
  const conversationId = extractConversationIdFromUrl(context.responseUrl);
  const imageIds = new Set<string>();
  const prompts: string[] = [];
  const captions: string[] = [];

  walkUnknown(document, (value) => {
    if (typeof value === "string") {
      const prompt = parsePromptJsonText(value).prompt;
      if (prompt) {
        prompts.push(prompt);
      }

      const caption = extractModelCaption(value);
      if (caption) {
        captions.push(caption);
      }

      for (const imageId of imageIdsFromAssetPointer(value)) {
        imageIds.add(imageId);
      }
    }
  });

  return [...imageIds].map((imageId) => ({
    source: "chatgpt-web",
    conversationId,
    imageId,
    imageUrl: context.imageUrls.get(imageId),
    prompt: prompts.at(0),
    caption: captions.at(0),
    imageRole: captions.length > 0 || prompts.length > 0 ? "generated" : "unknown",
    capturedAt: context.capturedAt
  }));
}

function walkUnknown(value: unknown, visit: (value: unknown) => void): void {
  visit(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      walkUnknown(entry, visit);
    }
    return;
  }

  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      walkUnknown(entry, visit);
    }
  }
}

function imageIdsFromAssetPointer(assetPointer: string | undefined): string[] {
  if (!assetPointer) {
    return [];
  }

  const ids = new Set<string>();

  try {
    const parsed = new URL(assetPointer);
    if (parsed.pathname === "/backend-api/estuary/content") {
      const imageId = parsed.searchParams.get("id");
      if (imageId) {
        ids.add(imageId);
      }
    }
  } catch {
    // Not a URL; fall through to the asset pointer/file id scan below.
  }

  for (const match of assetPointer.matchAll(/(?:sediment:\/\/)?(file_[A-Za-z0-9_-]+)/g)) {
    ids.add(match[1]);
  }

  return [...ids];
}

function addImageIdsFromString(ids: Set<string>, value: string | undefined): void {
  for (const imageId of imageIdsFromAssetPointer(value)) {
    ids.add(imageId);
  }
}

function mergeMetadata(existing: ImageMetadata, incoming: ImageMetadata): ImageMetadata {
  const incomingScore = metadataScore(incoming);
  const existingScore = metadataScore(existing);
  const preferIncomingIdentity = incomingScore >= existingScore;

  return {
    source: "chatgpt-web",
    conversationId: incoming.conversationId ?? existing.conversationId,
    messageId: preferIncomingIdentity ? incoming.messageId ?? existing.messageId : existing.messageId ?? incoming.messageId,
    imageId: incoming.imageId ?? existing.imageId,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    prompt: incoming.prompt ?? existing.prompt,
    revisedPrompt: incoming.revisedPrompt ?? existing.revisedPrompt,
    caption: preferLonger(incoming.caption, existing.caption),
    userInput: preferLonger(incoming.userInput, existing.userInput),
    imageRole: mergeImageRole(existing.imageRole, incoming.imageRole),
    createdAt: earliestIso(existing.createdAt, incoming.createdAt),
    capturedAt: incoming.capturedAt
  };
}

function metadataScore(item: ImageMetadata): number {
  return [
    item.imageId ? 1 : 0,
    item.imageUrl ? 1 : 0,
    item.prompt ? 4 : 0,
    item.revisedPrompt ? 2 : 0,
    item.caption ? 3 : 0,
    item.userInput ? 2 : 0,
    item.imageRole && item.imageRole !== "unknown" ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function mergeImageRole(
  existing: ImageMetadata["imageRole"],
  incoming: ImageMetadata["imageRole"]
): ImageMetadata["imageRole"] {
  if (existing === incoming) {
    return existing;
  }
  if (incoming === "generated" || existing === "generated") {
    return "generated";
  }
  if (incoming === "user_attachment" || existing === "user_attachment") {
    return "user_attachment";
  }
  return incoming ?? existing;
}

function preferLonger(first?: string, second?: string): string | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return first.length >= second.length ? first : second;
}

function earliestIso(first?: string, second?: string): string | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function normalizeImageUrlMap(source: ParseChatGptOptions["imageUrls"]): ReadonlyMap<string, string> {
  if (!source) {
    return new Map();
  }

  if (source instanceof Map) {
    return source;
  }

  return new Map(Object.entries(source));
}

function extractConversationIdFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const parsed = parseUrl(url);
  const match = parsed?.pathname.match(/\/backend-api\/conversation\/([^/?#]+)/);
  return match?.[1];
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function isChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function timestampToIso(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) {
    return undefined;
  }

  const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toISOString();
}
