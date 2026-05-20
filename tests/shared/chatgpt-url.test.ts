import { describe, expect, it } from "vitest";
import {
  buildConversationApiUrl,
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
