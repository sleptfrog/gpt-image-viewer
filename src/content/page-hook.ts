import {
  extractCapturedConversationItems,
  extractCapturedImageUrlRecords
} from "./extract-captured-data";

(() => {
type CaptureType = "conversation" | "recent-image-gen";

type CapturedXhr = XMLHttpRequest & { __gptImageViewerUrl?: string };

const INSTALL_FLAG = "__gptImageViewerPageHookInstalled";
const PAGE_SOURCE = "gpt-image-viewer-page-hook";
const MAX_BODY_CHARS = 25_000_000;
const MAX_ITEMS = 1000;
const pageWindow = window as unknown as Window & Record<string, unknown>;

if (pageWindow[INSTALL_FLAG]) {
  return;
}
pageWindow[INSTALL_FLAG] = true;

function captureTypeForUrl(url: string): CaptureType | undefined {
  try {
    const parsed = new URL(url, location.href);
    if (!isChatGptHost(parsed.hostname)) {
      return undefined;
    }

    if (/^\/backend-api\/conversation\/[^/?#]+/.test(parsed.pathname)) {
      return "conversation";
    }

    if (parsed.pathname === "/backend-api/my/recent/image_gen") {
      return "recent-image-gen";
    }
  } catch {
    return undefined;
  }
}

function postCapturedResponse(url: string, body: string): void {
  const type = captureTypeForUrl(url);
  if (!type || typeof body !== "string" || body.length === 0 || body.length > MAX_BODY_CHARS) {
    return;
  }

  const capturedAt = new Date().toISOString();
  if (type === "conversation") {
    const result = extractCapturedConversationItems({ body, responseUrl: url, capturedAt });
    if (result.items.length === 0 && (!result.conversationId || !result.hasConversationMapping)) {
      return;
    }

    window.postMessage(
      {
        source: PAGE_SOURCE,
        version: 1,
        type: "conversation-items",
        url,
        conversationId: result.conversationId,
        capturedAt,
        items: result.items.slice(0, MAX_ITEMS)
      },
      location.origin
    );
    return;
  }

  const records = extractCapturedImageUrlRecords({ body, capturedAt }).slice(0, MAX_ITEMS);
  if (records.length === 0) {
    return;
  }

  window.postMessage(
    {
      source: PAGE_SOURCE,
      version: 1,
      type: "image-url-records",
      url,
      capturedAt,
      records
    },
    location.origin
  );
}

const originalFetch = window.fetch;
window.fetch = async function gptImageViewerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await originalFetch.apply(this, [input, init]);

  try {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const responseUrl = response.url || requestUrl;
    if (responseUrl && captureTypeForUrl(responseUrl)) {
      response
        .clone()
        .text()
        .then((body) => postCapturedResponse(responseUrl, body))
        .catch(() => undefined);
    }
  } catch {
    // Keep ChatGPT's own fetch behavior untouched if capture fails.
  }

  return response;
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function gptImageViewerOpen(
  this: CapturedXhr,
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null
): void {
  this.__gptImageViewerUrl = String(url);
  return originalOpen.apply(this, [method, url, async ?? true, username ?? null, password ?? null]);
};

XMLHttpRequest.prototype.send = function gptImageViewerSend(this: CapturedXhr, body?: Document | XMLHttpRequestBodyInit | null): void {
  this.addEventListener("loadend", function handleLoadEnd(this: CapturedXhr) {
    try {
      const responseUrl = this.responseURL || this.__gptImageViewerUrl;
      if (!responseUrl || !captureTypeForUrl(responseUrl)) {
        return;
      }

      if (this.responseType === "" || this.responseType === "text") {
        postCapturedResponse(responseUrl, this.responseText);
        return;
      }

      if (this.responseType === "json" && this.response) {
        postCapturedResponse(responseUrl, JSON.stringify(this.response));
      }
    } catch {
      // Keep ChatGPT's own XHR behavior untouched if capture fails.
    }
  });

  return originalSend.apply(this, [body]);
};

function isChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}
})();
