import { describe, expect, it } from "vitest";
import {
  buildConversationApiUrl,
  classifyChatGptPageUrl,
  isSupportedChatGptUrl,
  parseChatGptConversationUrl
} from "../../src/shared/chatgpt-url";

describe("ChatGPT URL helpers", () => {
  it("extracts conversation ids from current ChatGPT URL shapes", () => {
    expect(parseChatGptConversationUrl("https://chatgpt.com/c/abc-123")).toEqual({
      conversationId: "abc-123",
      origin: "https://chatgpt.com"
    });
    expect(parseChatGptConversationUrl("https://chatgpt.com/g/g-p-example/c/conv-456")).toEqual({
      conversationId: "conv-456",
      origin: "https://chatgpt.com"
    });
    expect(parseChatGptConversationUrl("https://chat.openai.com/c/legacy-789")).toEqual({
      conversationId: "legacy-789",
      origin: "https://chat.openai.com"
    });
    expect(parseChatGptConversationUrl("https://chatgpt.com/g/g-6a0a228cc2848191b02c144566a460f9-rita/c/conv-gpt")).toEqual({
      conversationId: "conv-gpt",
      origin: "https://chatgpt.com"
    });
  });

  it("classifies ChatGPT page kinds", () => {
    expect(classifyChatGptPageUrl("https://example.com/c/abc-123")).toEqual({ kind: "unsupported" });
    expect(classifyChatGptPageUrl("https://chatgpt.com")).toEqual({
      kind: "chatgpt",
      page: "home",
      origin: "https://chatgpt.com"
    });
    expect(classifyChatGptPageUrl("https://chatgpt.com/images")).toEqual({
      kind: "images",
      origin: "https://chatgpt.com"
    });
    expect(classifyChatGptPageUrl("https://chatgpt.com/library")).toEqual({
      kind: "chatgpt",
      page: "library",
      origin: "https://chatgpt.com"
    });
    expect(classifyChatGptPageUrl("https://chatgpt.com/g/g-p-example/c/conv-project")).toEqual({
      kind: "conversation",
      conversationId: "conv-project",
      origin: "https://chatgpt.com"
    });
  });

  it("builds backend conversation API URLs", () => {
    const context = parseChatGptConversationUrl("https://chatgpt.com/g/g-p-example/c/conv-456");

    expect(context && buildConversationApiUrl(context)).toBe(
      "https://chatgpt.com/backend-api/conversation/conv-456"
    );
  });

  it("rejects unsupported URLs", () => {
    expect(parseChatGptConversationUrl("https://chatgpt.com/")).toBeUndefined();
    expect(parseChatGptConversationUrl("https://example.com/c/abc-123")).toBeUndefined();
    expect(isSupportedChatGptUrl("https://chatgpt.com/c/abc-123")).toBe(true);
    expect(isSupportedChatGptUrl("https://example.com/c/abc-123")).toBe(false);
  });
});
