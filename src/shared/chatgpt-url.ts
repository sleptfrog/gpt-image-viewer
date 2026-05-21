const SUPPORTED_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

export type ChatGptConversationContext = {
  conversationId: string;
  origin: string;
};

export type ChatGptPageContext =
  | { kind: "unsupported" }
  | { kind: "conversation"; conversationId: string; origin: string }
  | { kind: "images"; origin: string }
  | { kind: "chatgpt"; page: "home" | "library" | "other"; origin: string };

export function classifyChatGptPageUrl(url: string | undefined): ChatGptPageContext {
  if (!url) {
    return { kind: "unsupported" };
  }

  const parsed = parseUrl(url);
  if (!parsed || !SUPPORTED_HOSTS.has(parsed.hostname)) {
    return { kind: "unsupported" };
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const conversationMarkerIndex = parts.lastIndexOf("c");
  const conversationId = conversationMarkerIndex >= 0 ? parts[conversationMarkerIndex + 1] : undefined;

  if (conversationId) {
    return {
      kind: "conversation",
      conversationId,
      origin: parsed.origin
    };
  }

  if (parts.length === 0) {
    return { kind: "chatgpt", page: "home", origin: parsed.origin };
  }

  if (parts[0] === "images") {
    return { kind: "images", origin: parsed.origin };
  }

  if (parts[0] === "library") {
    return { kind: "chatgpt", page: "library", origin: parsed.origin };
  }

  return { kind: "chatgpt", page: "other", origin: parsed.origin };
}

export function parseChatGptConversationUrl(url: string | undefined): ChatGptConversationContext | undefined {
  const context = classifyChatGptPageUrl(url);
  return context.kind === "conversation"
    ? { conversationId: context.conversationId, origin: context.origin }
    : undefined;
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
