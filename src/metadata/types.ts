export type ImageRole = "generated" | "user_attachment" | "unknown";

export type ImageMetadata = {
  source: "chatgpt-web";
  conversationId?: string;
  messageId?: string;
  imageId?: string;
  imageUrl?: string;
  prompt?: string;
  revisedPrompt?: string;
  caption?: string;
  userInput?: string;
  imageRole?: ImageRole;
  createdAt?: string;
  capturedAt: string;
  raw?: unknown;
};

export type ParseDiagnostic = {
  level: "info" | "warning";
  message: string;
};

export type ParseChatGptOptions = {
  responseBody: string;
  responseUrl?: string;
  capturedAt?: string;
  imageUrls?: ReadonlyMap<string, string> | Record<string, string>;
};

export type ParseChatGptResult = {
  conversationId?: string;
  diagnostics: ParseDiagnostic[];
  items: ImageMetadata[];
};

export type MetadataExport = {
  schemaVersion: 1;
  exportedAt: string;
  items: ImageMetadata[];
};
