(() => {
  const PAGE_SOURCE = "gpt-image-viewer-page-hook";
  const MESSAGE_TYPES = {
    "conversation-response": "gpt-image-viewer:capture-conversation",
    "recent-image-gen-response": "gpt-image-viewer:capture-recent-image-gen"
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    const messageType = data && data.source === PAGE_SOURCE ? MESSAGE_TYPES[data.type] : undefined;
    if (!messageType) {
      return;
    }

    const message = {
      type: messageType,
      payload: {
        url: data.url,
        body: data.body,
        capturedAt: data.capturedAt
      }
    };

    try {
      const result = chrome.runtime.sendMessage(message);
      if (result && typeof result.catch === "function") {
        result.catch(() => undefined);
      }
    } catch {
      // The extension may be reloading while the page is still alive.
    }
  });
})();
