const SUPPORTED_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

export type ChatGptConversationContext = {
  conversationId: string;
  origin: string;
};

export function parseChatGptConversationUrl(url: string | undefined): ChatGptConversationContext | undefined {
  if (!url) {
    return undefined;
  }

  const parsed = parseUrl(url);
  if (!parsed || !SUPPORTED_HOSTS.has(parsed.hostname)) {
    return undefined;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const conversationMarkerIndex = parts.lastIndexOf("c");
  const conversationId = conversationMarkerIndex >= 0 ? parts[conversationMarkerIndex + 1] : undefined;

  if (!conversationId) {
    return undefined;
  }

  return {
    conversationId,
    origin: parsed.origin
  };
}

export function buildConversationApiUrl(context: ChatGptConversationContext): string {
  return `${context.origin}/backend-api/conversation/${encodeURIComponent(context.conversationId)}`;
}

export function isSupportedChatGptUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const parsed = parseUrl(url);
  return Boolean(parsed && SUPPORTED_HOSTS.has(parsed.hostname));
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
