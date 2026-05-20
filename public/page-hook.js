(() => {
  const INSTALL_FLAG = "__gptImageViewerPageHookInstalled";
  const PAGE_SOURCE = "gpt-image-viewer-page-hook";

  if (window[INSTALL_FLAG]) {
    return;
  }
  window[INSTALL_FLAG] = true;

  function captureTypeForUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const supportedHost = parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
      if (!supportedHost) {
        return undefined;
      }

      if (/^\/backend-api\/conversation\/[^/?#]+/.test(parsed.pathname)) {
        return "conversation-response";
      }

      if (parsed.pathname === "/backend-api/my/recent/image_gen") {
        return "recent-image-gen-response";
      }
    } catch {
      return undefined;
    }
  }

  function postCapturedResponse(url, body) {
    const type = captureTypeForUrl(url);
    if (typeof body !== "string" || body.length === 0 || !type) {
      return;
    }

    window.postMessage(
      {
        source: PAGE_SOURCE,
        type,
        url,
        body,
        capturedAt: new Date().toISOString()
      },
      "*"
    );
  }

  const originalFetch = window.fetch;
  window.fetch = async function gptImageSaverFetch(input, init) {
    const response = await originalFetch.apply(this, arguments);

    try {
      const requestUrl = typeof input === "string" ? input : input && input.url;
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

  XMLHttpRequest.prototype.open = function gptImageSaverOpen(method, url) {
    this.__gptImageSaverUrl = typeof url === "string" ? url : String(url);
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function gptImageSaverSend() {
    this.addEventListener("loadend", function handleLoadEnd() {
      try {
        const responseUrl = this.responseURL || this.__gptImageSaverUrl;
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

    return originalSend.apply(this, arguments);
  };
})();
