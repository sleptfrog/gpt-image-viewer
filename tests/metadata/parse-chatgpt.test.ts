import { describe, expect, it } from "vitest";
import sanitizedConversation from "../fixtures/sanitized-conversation.json";
import {
  extractEstuaryImageId,
  isChatGptConversationUrl,
  isChatGptEstuaryContentUrl,
  parseChatGptResponse
} from "../../src/metadata/parse-chatgpt";

const conversationUrl = "https://chatgpt.com/backend-api/conversation/conv_sanitized";
const imageUrl =
  "https://chatgpt.com/backend-api/estuary/content?id=file_sanitized_image_1&ts=1&p=fs&cid=1&sig=redacted&v=0";

describe("parseChatGptResponse", () => {
  it("extracts image metadata from a conversation mapping", () => {
    const result = parseChatGptResponse({
      responseBody: JSON.stringify(sanitizedConversation),
      responseUrl: conversationUrl,
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.conversationId).toBe("conv_sanitized");
    expect(result.conversationTitle).toBe("Sanitized test chat");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: "chatgpt-web",
      conversationId: "conv_sanitized",
      messageId: "caption-image-message",
      imageId: "file_sanitized_image_1",
      prompt: "Draw a clean test image with three colored geometric shapes on a white desk.",
      caption: "A clean test image with three colored geometric shapes on a white desk.",
      userInput: "Create a simple test image.",
      imageRole: "generated",
      createdAt: "2023-11-14T22:13:22.000Z",
      capturedAt: "2026-05-19T00:00:00.000Z"
    });
  });

  it("merges async and caption nodes for the same image id", () => {
    const result = parseChatGptResponse({
      responseBody: JSON.stringify(sanitizedConversation),
      responseUrl: conversationUrl,
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].messageId).toBe("caption-image-message");
    expect(result.items[0].caption).toContain("geometric shapes");
    expect(result.items[0].userInput).toBe("Create a simple test image.");
    expect(result.items[0].imageRole).toBe("generated");
  });

  it("classifies user attached images separately from generated images", () => {
    const result = parseChatGptResponse({
      responseBody: JSON.stringify({
        conversation_id: "conv_user_attachment",
        mapping: {
          "user-attachment-node": {
            parent: null,
            children: [],
            message: {
              id: "user-attachment-message",
              author: { role: "user" },
              create_time: 1700000200,
              content: {
                content_type: "multimodal_text",
                parts: [
                  "Use this as a reference image.",
                  {
                    content_type: "image_asset_pointer",
                    asset_pointer: "sediment://file_user_attachment_1",
                    metadata: {}
                  }
                ]
              },
              metadata: {}
            }
          }
        }
      }),
      responseUrl: "https://chatgpt.com/backend-api/conversation/conv_user_attachment",
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      conversationId: "conv_user_attachment",
      messageId: "user-attachment-message",
      imageId: "file_user_attachment_1",
      userInput: "Use this as a reference image.",
      imageRole: "user_attachment"
    });
  });

  it("applies estuary image URLs when they are known", () => {
    const result = parseChatGptResponse({
      responseBody: JSON.stringify(sanitizedConversation),
      responseUrl: conversationUrl,
      capturedAt: "2026-05-19T00:00:00.000Z",
      imageUrls: new Map([["file_sanitized_image_1", imageUrl]])
    });

    expect(result.items[0].imageUrl).toBe(imageUrl);
  });

  it("extracts hidden asset pointers from nested conversation JSON", () => {
    const result = parseChatGptResponse({
      responseBody: JSON.stringify({
        conversation_id: "conv_hidden_asset",
        mapping: {
          "hidden-image-node": {
            parent: null,
            children: [],
            message: {
              id: "hidden-image-message",
              create_time: 1700000100,
              content: {
                content_type: "multimodal_text",
                parts: [
                  {
                    asset_pointer: "sediment://file_hidden_history_image",
                    metadata: {
                      generation: {
                        gen_id: "hidden-gen"
                      }
                    }
                  }
                ]
              },
              metadata: {
                image_gen_title: "Hidden history image",
                is_visually_hidden_from_conversation: true
              }
            }
          }
        }
      }),
      responseUrl: "https://chatgpt.com/backend-api/conversation/conv_hidden_asset",
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      conversationId: "conv_hidden_asset",
      messageId: "hidden-image-message",
      imageId: "file_hidden_history_image",
      caption: "Hidden history image",
      imageRole: "generated"
    });
  });

  it("parses SSE data lines that contain conversation JSON", () => {
    const result = parseChatGptResponse({
      responseBody: `event: message\ndata: ${JSON.stringify(sanitizedConversation)}\n\ndata: [DONE]\n`,
      responseUrl: conversationUrl,
      capturedAt: "2026-05-19T00:00:00.000Z"
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].imageId).toBe("file_sanitized_image_1");
  });
});

describe("ChatGPT request classifiers", () => {
  it("matches supported conversation and estuary URLs", () => {
    expect(isChatGptConversationUrl(conversationUrl)).toBe(true);
    expect(isChatGptConversationUrl("https://chat.openai.com/backend-api/conversation/legacy_conv")).toBe(true);
    expect(isChatGptConversationUrl("https://example.com/backend-api/conversation/conv")).toBe(false);

    expect(isChatGptEstuaryContentUrl(imageUrl)).toBe(true);
    expect(extractEstuaryImageId(imageUrl)).toBe("file_sanitized_image_1");
  });
});
