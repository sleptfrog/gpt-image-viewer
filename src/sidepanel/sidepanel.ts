import type { ImageMetadata } from "../metadata/types";
import { embedImageMetadata, type SupportedImageFormat } from "../metadata/embed-image-metadata";
import { createMetadataExport, stripRawMetadata } from "../metadata/write-metadata";
import { loadCapturedConversation } from "../shared/capture-store";
import { parseChatGptConversationUrl } from "../shared/chatgpt-url";
import {
  clearImageUrlRecords,
  createImageUrlRecordsExport,
  IMAGE_URL_RECORDS_KEY,
  importImageUrlRecords,
  loadImageUrlRecords,
  mergeImageUrlRecord,
  saveImageUrlRecords,
  type ImageUrlRecord
} from "../shared/image-url-store";
import { createZipArchive, type ZipFileEntry } from "../shared/zip";

type PageImageCandidate = {
  imageId: string;
  imageUrl: string;
  alt?: string;
  width?: number;
  height?: number;
};

type LoadOptions = {
  collectPageImages?: boolean;
  pageImageScanAttempts?: number;
  pageImageScanDelayMs?: number;
  status?: string;
};

type PageImageScanOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

const AUTO_PAGE_IMAGE_SCAN_ATTEMPTS = 5;
const AUTO_PAGE_IMAGE_SCAN_DELAY_MS = 400;

const statusEl = queryRequired<HTMLParagraphElement>("#status");
const countEl = queryRequired<HTMLSpanElement>("#item-count");
const conversationIdEl = queryRequired<HTMLSpanElement>("#conversation-id");
const contentEl = queryRequired<HTMLElement>("#content");
const refreshButton = queryRequired<HTMLButtonElement>("#refresh");
const showAttachmentsToggle = queryRequired<HTMLInputElement>("#show-attachments");
const selectionSummaryEl = queryRequired<HTMLSpanElement>("#selection-summary");
const selectionToggleButton = queryRequired<HTMLButtonElement>("#selection-toggle");
const downloadSelectedButton = queryRequired<HTMLButtonElement>("#download-selected");
const moreActionsMenu = queryRequired<HTMLDetailsElement>("#more-actions");
const exportJsonButton = queryRequired<HTMLButtonElement>("#export-json");
const exportDictionaryButton = queryRequired<HTMLButtonElement>("#export-dictionary");
const importDictionaryButton = queryRequired<HTMLButtonElement>("#import-dictionary");
const clearDictionaryButton = queryRequired<HTMLButtonElement>("#clear-dictionary");
const dictionaryFileInput = queryRequired<HTMLInputElement>("#dictionary-file");
const downloadProgress = queryRequired<HTMLElement>("#download-progress");
const downloadProgressLabel = queryRequired<HTMLSpanElement>("#download-progress-label");
const downloadProgressCount = queryRequired<HTMLSpanElement>("#download-progress-count");
const downloadProgressBar = queryRequired<HTMLProgressElement>("#download-progress-bar");
const clearDictionaryDialog = queryRequired<HTMLDialogElement>("#clear-dictionary-dialog");
const downloadAllDialog = queryRequired<HTMLDialogElement>("#download-all-dialog");
const downloadAllMessage = queryRequired<HTMLParagraphElement>("#download-all-message");
const viewerDialog = queryRequired<HTMLDialogElement>("#viewer-dialog");
const viewerCloseButton = queryRequired<HTMLButtonElement>("#viewer-close");
const viewerPositionEl = queryRequired<HTMLParagraphElement>("#viewer-position");
const viewerImage = queryRequired<HTMLImageElement>("#viewer-image");
const viewerImageStatus = queryRequired<HTMLElement>("#viewer-image-status");
const viewerPrevButton = queryRequired<HTMLButtonElement>("#viewer-prev");
const viewerNextButton = queryRequired<HTMLButtonElement>("#viewer-next");
const viewerPrevEdgeButton = queryRequired<HTMLButtonElement>("#viewer-prev-edge");
const viewerNextEdgeButton = queryRequired<HTMLButtonElement>("#viewer-next-edge");
const viewerDownloadButton = queryRequired<HTMLButtonElement>("#viewer-download");
const viewerCopyImageButton = queryRequired<HTMLButtonElement>("#viewer-copy-image");
const viewerImageIdEl = queryRequired<HTMLSpanElement>("#viewer-image-id");
const viewerCreatedAtEl = queryRequired<HTMLTimeElement>("#viewer-created-at");
const viewerUserInputEl = queryRequired<HTMLParagraphElement>("#viewer-user-input");
const viewerCaptionEl = queryRequired<HTMLParagraphElement>("#viewer-caption");
const viewerPromptEl = queryRequired<HTMLParagraphElement>("#viewer-prompt");
const viewerCopyUserInputButton = queryRequired<HTMLButtonElement>("#viewer-copy-user-input");
const viewerCopyCaptionButton = queryRequired<HTMLButtonElement>("#viewer-copy-caption");
const viewerCopyPromptButton = queryRequired<HTMLButtonElement>("#viewer-copy-prompt");

let currentItems: ImageMetadata[] = [];
let currentPreviewUrls = new Map<string, string>();
let selectedItemKeys = new Set<string>();
let showUserAttachments = false;
let loadSequence = 0;
let autoRefreshTimer: number | undefined;
let pendingLoadOptions: LoadOptions = {};
let viewerIndex = -1;

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Side panel DOM is missing ${selector}.`);
  }

  return element;
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function hideDownloadProgress(): void {
  downloadProgress.hidden = true;
  downloadProgressLabel.textContent = "";
  downloadProgressCount.textContent = "";
  downloadProgressBar.value = 0;
  downloadProgressBar.max = 1;
}

function updateDownloadProgress(label: string, completed: number, total: number): void {
  const safeTotal = Math.max(1, total);
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal);
  downloadProgress.hidden = false;
  downloadProgressLabel.textContent = label;
  downloadProgressCount.textContent = `${safeCompleted} / ${safeTotal}`;
  downloadProgressBar.max = safeTotal;
  downloadProgressBar.value = safeCompleted;
}

async function loadCurrentConversation(options: LoadOptions = {}): Promise<void> {
  const sequence = (loadSequence += 1);
  const shouldCollectPageImages = options.collectPageImages ?? true;
  setBusy(true);
  hideDownloadProgress();
  setStatus(options.status ?? "現在のチャットを読み込み中");
  contentEl.replaceChildren(renderEmpty("読み込み中"));

  try {
    const tab = await getActiveTab();
    const context = parseChatGptConversationUrl(tab.url);

    if (sequence !== loadSequence) {
      return;
    }

    if (!tab.id || !context) {
      currentItems = [];
      currentPreviewUrls = new Map();
      selectedItemKeys = new Set();
      conversationIdEl.textContent = "-";
      setStatus("ChatGPTのチャットページを開くと画像一覧を表示します");
      renderItems([]);
      return;
    }

    conversationIdEl.textContent = context.conversationId;

    const capturedAt = new Date().toISOString();
    const pageImages = shouldCollectPageImages
      ? await collectPageImageUrls(tab.id, {
          maxAttempts: options.pageImageScanAttempts,
          delayMs: options.pageImageScanDelayMs
        }).catch((error: unknown) => {
          console.warn("Failed to scan page image URLs", error);
          return [];
        })
      : [];
    const imageUrlRecords = await loadImageUrlRecords().catch((error: unknown) => {
      console.warn("Failed to load image URL records", error);
      return new Map<string, ImageUrlRecord>();
    });
    const pageRecords = pageImages.map((image) => pageImageToUrlRecord(image, capturedAt));
    mergeImageUrlRecords(imageUrlRecords, pageRecords);
    if (shouldCollectPageImages) {
      await saveImageUrlRecords(pageRecords).catch((error: unknown) => {
        console.warn("Failed to save page image URL records", error);
      });
    }

    if (sequence !== loadSequence) {
      return;
    }

    let imageUrls = imageUrlMapFromRecords(imageUrlRecords);
    const loaded = await loadConversationMetadata(context.conversationId, imageUrls);
    currentItems = sortItems(applyImageUrlRecords(loaded.items, imageUrlRecords).map(stripRawMetadata));
    currentPreviewUrls = previewUrlMapFromRecords(imageUrlRecords);
    imageUrls = imageUrlMapFromRecords(imageUrlRecords);

    const visibleItems = getVisibleItems();
    setStatus(
      formatLoadedStatus(
        loaded.statusPrefix,
        visibleItems.length,
        pageImages.length,
        countItemsWithUrlRecords(visibleItems, imageUrlRecords),
        imageUrlRecords.size,
        collectMissingImageIds(visibleItems, imageUrls).length,
        countHiddenUserAttachments(currentItems)
      )
    );
    renderCurrentItems();
  } catch (error) {
    currentItems = [];
    currentPreviewUrls = new Map();
    selectedItemKeys = new Set();
    conversationIdEl.textContent = "-";
    setStatus("チャットの読み込みに失敗しました");
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : "不明なエラー");
  } finally {
    if (sequence === loadSequence) {
      setBusy(false);
    }
  }
}

function scheduleLoadCurrentConversation(options: LoadOptions = {}): void {
  pendingLoadOptions = { ...pendingLoadOptions, ...options };

  if (autoRefreshTimer !== undefined) {
    window.clearTimeout(autoRefreshTimer);
  }

  autoRefreshTimer = window.setTimeout(() => {
    autoRefreshTimer = undefined;
    const loadOptions = pendingLoadOptions;
    pendingLoadOptions = {};
    void loadCurrentConversation(loadOptions);
  }, 250);
}

async function loadConversationMetadata(
  conversationId: string,
  imageUrls: ReadonlyMap<string, string>
): Promise<{ items: ImageMetadata[]; statusPrefix: string }> {
  const snapshot = await loadCapturedConversation(conversationId);
  if (snapshot) {
    return {
      items: applyImageUrls(stripImageUrls(snapshot.items), imageUrls),
      statusPrefix: "取得済みデータを読み込み"
    };
  }

  throw new Error(
    "このチャットのメタデータはまだ取得されていません。ChatGPTタブを一度再読み込みしてから、このサイドパネルを更新してください。"
  );
}

function stripImageUrls(items: ImageMetadata[]): ImageMetadata[] {
  return items.map((item) => {
    if (!item.imageUrl) {
      return item;
    }

    const stripped = { ...item };
    delete stripped.imageUrl;
    return stripped;
  });
}

function applyImageUrls(items: ImageMetadata[], imageUrls: ReadonlyMap<string, string>): ImageMetadata[] {
  return items.map((item) => {
    if (!item.imageId || item.imageUrl) {
      return item;
    }

    const imageUrl = imageUrls.get(item.imageId);
    return imageUrl ? { ...item, imageUrl } : item;
  });
}

function applyImageUrlRecords(
  items: ImageMetadata[],
  records: ReadonlyMap<string, ImageUrlRecord>
): ImageMetadata[] {
  return items.map((item) => {
    const record = item.imageId ? records.get(item.imageId) : undefined;
    if (!record) {
      return item;
    }

    return {
      ...item,
      conversationId: item.conversationId ?? record.conversationId,
      messageId: item.messageId ?? record.messageId,
      imageUrl: item.imageUrl ?? record.imageUrl,
      prompt: item.prompt ?? record.prompt,
      caption: item.caption ?? record.title,
      createdAt: item.createdAt ?? record.createdAt
    };
  });
}

function mergeImageUrlRecords(target: Map<string, ImageUrlRecord>, records: ImageUrlRecord[]): void {
  for (const record of records) {
    const existing = target.get(record.imageId);
    target.set(record.imageId, existing ? mergeImageUrlRecord(existing, record) : record);
  }
}

function imageUrlMapFromRecords(records: ReadonlyMap<string, ImageUrlRecord>): Map<string, string> {
  const imageUrls = new Map<string, string>();

  for (const record of records.values()) {
    if (record.imageUrl) {
      imageUrls.set(record.imageId, record.imageUrl);
    }
  }

  return imageUrls;
}

function previewUrlMapFromRecords(records: ReadonlyMap<string, ImageUrlRecord>): Map<string, string> {
  const previewUrls = new Map<string, string>();

  for (const record of records.values()) {
    if (record.thumbnailUrl) {
      previewUrls.set(record.imageId, record.thumbnailUrl);
    }
  }

  return previewUrls;
}

function pageImageToUrlRecord(image: PageImageCandidate, capturedAt: string): ImageUrlRecord {
  return {
    imageId: image.imageId,
    imageUrl: image.imageUrl,
    capturedAt,
    source: "page-dom"
  };
}

function collectMissingImageIds(items: ImageMetadata[], imageUrls: ReadonlyMap<string, string>): string[] {
  const ids = new Set<string>();

  for (const item of items) {
    if (item.imageId && !item.imageUrl && !imageUrls.has(item.imageId)) {
      ids.add(item.imageId);
    }
  }

  return [...ids];
}

function countItemsWithUrlRecords(
  items: ImageMetadata[],
  records: ReadonlyMap<string, ImageUrlRecord>
): number {
  return items.filter((item) => item.imageId && records.has(item.imageId)).length;
}

function formatLoadedStatus(
  statusPrefix: string,
  itemCount: number,
  pageUrlCount: number,
  matchedUrlRecordCount: number,
  storedUrlRecordCount: number,
  missingUrlCount: number,
  hiddenAttachmentCount: number
): string {
  const parts = [
    `${statusPrefix}: ${itemCount}件`,
    `ページ上のURL ${pageUrlCount}件`,
    `辞書URL ${matchedUrlRecordCount}/${storedUrlRecordCount}件`
  ];

  if (missingUrlCount > 0) {
    parts.push(`画像未取得 ${missingUrlCount}件`);
  }

  if (!showUserAttachments && hiddenAttachmentCount > 0) {
    parts.push(`添付画像を非表示 ${hiddenAttachmentCount}件`);
  }

  return parts.join(", ");
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    throw new Error("アクティブなタブが見つかりません");
  }

  return tab;
}

async function collectPageImageUrls(
  tabId: number,
  options: PageImageScanOptions = {}
): Promise<PageImageCandidate[]> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const delayMs = Math.max(0, options.delayMs ?? 0);
  let best: PageImageCandidate[] = [];
  let stableNonEmptyScans = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidates = await collectPageImageUrlsOnce(tabId);
    if (candidates.length > best.length) {
      best = candidates;
      stableNonEmptyScans = 0;
    } else if (candidates.length > 0 && candidates.length === best.length) {
      stableNonEmptyScans += 1;
    }

    if (stableNonEmptyScans >= 1 || attempt === maxAttempts - 1) {
      break;
    }

    await delay(delayMs);
  }

  return best;
}

async function collectPageImageUrlsOnce(tabId: number): Promise<PageImageCandidate[]> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectImageUrlsFromPage
  });

  return Array.isArray(result?.result) ? result.result : [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function collectImageUrlsFromPage(): PageImageCandidate[] {
  const byId = new Map<string, PageImageCandidate>();

  function addCandidate(url: string | undefined, image: HTMLImageElement | undefined): void {
    if (!url) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url, location.href);
    } catch {
      return;
    }

    const supportedHost = parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
    const imageId = parsed.pathname === "/backend-api/estuary/content" ? parsed.searchParams.get("id") : undefined;

    if (!supportedHost || !imageId) {
      return;
    }

    byId.set(imageId, {
      imageId,
      imageUrl: parsed.toString(),
      alt: image?.alt || undefined,
      width: image?.naturalWidth || undefined,
      height: image?.naturalHeight || undefined
    });
  }

  for (const image of document.images) {
    addCandidate(image.currentSrc || image.src, image);
  }

  return [...byId.values()];
}

function sortItems(items: ImageMetadata[]): ImageMetadata[] {
  return [...items].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt ?? first.capturedAt);
    const secondTime = Date.parse(second.createdAt ?? second.capturedAt);
    return secondTime - firstTime;
  });
}

function setBusy(isBusy: boolean): void {
  refreshButton.disabled = isBusy;
  showAttachmentsToggle.disabled = isBusy;
  updateSelectionControls(isBusy);
  exportJsonButton.disabled = isBusy || getVisibleItems().length === 0;
  exportDictionaryButton.disabled = isBusy;
  importDictionaryButton.disabled = isBusy;
  clearDictionaryButton.disabled = isBusy;
  if (isBusy) {
    moreActionsMenu.open = false;
  }
}

function getVisibleItems(): ImageMetadata[] {
  if (showUserAttachments) {
    return currentItems;
  }
  return currentItems.filter((item) => item.imageRole !== "user_attachment");
}

function countHiddenUserAttachments(items: ImageMetadata[]): number {
  return items.filter((item) => item.imageRole === "user_attachment").length;
}

function renderCurrentItems(): void {
  renderItems(getVisibleItems());
}

function renderItems(items: ImageMetadata[]): void {
  pruneSelectedItems(items);
  countEl.textContent = String(items.length);
  updateSelectionControls(false);
  exportJsonButton.disabled = items.length === 0;

  if (items.length === 0) {
    const hiddenCount = countHiddenUserAttachments(currentItems);
    const message =
      !showUserAttachments && currentItems.length > 0 && hiddenCount > 0
        ? `添付画像 ${hiddenCount}件は非表示です。「添付画像を表示」をオンにすると表示できます。`
        : "画像メタデータはまだ見つかっていません";
    contentEl.replaceChildren(renderEmpty(message));
    syncViewerAfterItemsChange();
    return;
  }

  const list = document.createElement("div");
  list.className = "image-list";
  list.append(...items.map(renderImageCard));
  const missingCount = countMissingImages(items);
  const children: HTMLElement[] = missingCount > 0 ? [renderMissingImageNotice(missingCount), list] : [list];
  contentEl.replaceChildren(...children);
  syncViewerAfterItemsChange();
}

function countMissingImages(items: ImageMetadata[]): number {
  return items.filter((item) => !item.imageUrl).length;
}

function renderMissingImageNotice(missingCount: number): HTMLElement {
  const notice = document.createElement("div");
  notice.className = "missing-image-notice";
  notice.textContent = `画像未取得の項目が${missingCount}件あります。ChatGPTの「画像」ページを開き、対象画像が表示されるまでスクロールすると取り込めます。`;
  return notice;
}

function renderImageCard(item: ImageMetadata): HTMLElement {
  const card = document.createElement("article");
  card.className = "image-card";
  if (selectedItemKeys.has(imageItemKey(item))) {
    card.classList.add("image-card-selected");
  }

  card.append(renderThumbnail(item), renderImageMain(item));
  return card;
}

function renderThumbnail(item: ImageMetadata): HTMLElement {
  const previewUrl = item.imageId ? currentPreviewUrls.get(item.imageId) : undefined;
  const imageUrl = previewUrl ?? item.imageUrl;

  if (!imageUrl) {
    return renderThumbnailPlaceholder("画像未取得");
  }

  const wrapper = document.createElement("button");
  wrapper.className = "thumb";
  wrapper.type = "button";
  wrapper.setAttribute("aria-label", `${item.imageId ?? item.messageId ?? "画像"} をビューアで開く`);
  wrapper.addEventListener("click", () => openViewerForItem(item));

  const image = document.createElement("img");
  image.alt = item.caption ?? item.imageId ?? "ChatGPT生成画像";
  image.loading = "lazy";
  image.src = imageUrl;
  image.addEventListener("error", () => {
    wrapper.replaceWith(renderThumbnailPlaceholder("画像を表示できません"));
  });

  wrapper.append(image);
  return wrapper;
}

function renderThumbnailPlaceholder(label: string): HTMLElement {
  const placeholder = document.createElement("div");
  placeholder.className = "thumb-placeholder";
  placeholder.textContent = label;
  return placeholder;
}

function renderImageMain(item: ImageMetadata): HTMLElement {
  const main = document.createElement("div");
  main.className = "image-main";

  const heading = document.createElement("div");
  heading.className = "image-heading";

  const selectLabel = document.createElement("label");
  selectLabel.className = "image-select";
  const selectBox = document.createElement("input");
  selectBox.type = "checkbox";
  selectBox.checked = selectedItemKeys.has(imageItemKey(item));
  selectBox.disabled = !item.imageUrl;
  selectBox.addEventListener("change", () => {
    setItemSelected(item, selectBox.checked);
  });
  const selectText = document.createElement("span");
  selectText.textContent = "選択";
  selectLabel.append(selectBox, selectText);

  const imageId = document.createElement("div");
  imageId.className = "image-id";
  imageId.textContent = item.imageId ?? item.messageId ?? "画像";

  const time = document.createElement("time");
  time.className = "image-time";
  time.textContent = item.createdAt ? formatDisplayDate(item.createdAt) : "";

  heading.append(selectLabel, imageId, time);
  main.append(heading);

  if (item.imageRole === "user_attachment") {
    const role = document.createElement("p");
    role.className = "image-text image-role-text";
    role.textContent = "添付画像";
    main.append(role);
  }

  if (item.userInput) {
    const text = document.createElement("p");
    text.className = "image-text";
    text.textContent = `ユーザー入力: ${item.userInput}`;
    main.append(text);
  }

  const primaryText = item.caption ? `キャプション: ${item.caption}` : item.prompt ? `生成プロンプト: ${item.prompt}` : undefined;
  if (primaryText) {
    const text = document.createElement("p");
    text.className = "image-text";
    text.textContent = primaryText;
    main.append(text);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.textContent = "保存";
  downloadButton.disabled = !item.imageUrl;
  downloadButton.addEventListener("click", () => {
    void downloadSingleImage(item).catch((error: unknown) => {
      setStatus("画像の保存に失敗しました");
      console.warn("Failed to download image", error);
    });
  });
  actions.append(downloadButton);
  main.append(actions);

  return main;
}

function getDownloadableItems(): ImageMetadata[] {
  return getVisibleItems().filter((item) => Boolean(item.imageUrl));
}

function getSelectedDownloadableItems(): ImageMetadata[] {
  return getVisibleItems().filter((item) => item.imageUrl && selectedItemKeys.has(imageItemKey(item)));
}

function areAllDownloadableItemsSelected(): boolean {
  const downloadableItems = getDownloadableItems();
  return downloadableItems.length > 0 && downloadableItems.every((item) => selectedItemKeys.has(imageItemKey(item)));
}

function updateSelectionControls(isBusy: boolean): void {
  const downloadableItems = getDownloadableItems();
  const selectedItems = getSelectedDownloadableItems();
  const allSelected = areAllDownloadableItemsSelected();
  selectionSummaryEl.textContent = `${selectedItems.length} / ${downloadableItems.length}件選択`;
  selectionToggleButton.textContent = allSelected ? "全選択解除" : "全選択";
  selectionToggleButton.disabled = isBusy || downloadableItems.length === 0;
  downloadSelectedButton.disabled = isBusy || selectedItems.length === 0;
}

function pruneSelectedItems(items: ImageMetadata[]): void {
  const itemKeys = new Set(items.filter((item) => item.imageUrl).map(imageItemKey));
  selectedItemKeys = new Set([...selectedItemKeys].filter((key) => itemKeys.has(key)));
}

function setItemSelected(item: ImageMetadata, isSelected: boolean): void {
  const key = imageItemKey(item);
  if (isSelected) {
    selectedItemKeys.add(key);
  } else {
    selectedItemKeys.delete(key);
  }
  renderCurrentItems();
  const selectedCount = getSelectedDownloadableItems().length;
  setStatus(selectedCount > 0 ? `${selectedCount}件を選択中` : "選択を解除しました");
}

function toggleSelectAllDownloadableItems(): void {
  const downloadableItems = getDownloadableItems();
  if (downloadableItems.length === 0) {
    setStatus("選択できる取得済み画像がありません");
    return;
  }

  if (areAllDownloadableItemsSelected()) {
    selectedItemKeys = new Set();
    renderCurrentItems();
    setStatus("全選択を解除しました");
    return;
  }

  selectedItemKeys = new Set(downloadableItems.map(imageItemKey));
  renderCurrentItems();
  setStatus(`${downloadableItems.length}件を全選択しました`);
}

function getViewerItems(): ImageMetadata[] {
  return getVisibleItems().filter((item) => Boolean(item.imageUrl));
}

function openViewerForItem(item: ImageMetadata): void {
  const viewerItems = getViewerItems();
  const index = viewerItems.findIndex((candidate) => imageItemKey(candidate) === imageItemKey(item));
  if (index < 0) {
    setStatus("ビューアで表示できる画像URLがありません");
    return;
  }

  viewerIndex = index;
  renderViewer();
  if (!viewerDialog.open) {
    viewerDialog.showModal();
  }
  viewerCloseButton.focus();
}

function syncViewerAfterItemsChange(): void {
  if (!viewerDialog.open) {
    return;
  }

  const viewerItems = getViewerItems();
  if (viewerItems.length === 0) {
    closeViewer();
    return;
  }

  viewerIndex = clampViewerIndex(viewerIndex, viewerItems.length);
  renderViewer();
}

function closeViewer(): void {
  viewerIndex = -1;
  viewerImage.removeAttribute("src");
  if (viewerDialog.open) {
    viewerDialog.close();
  }
}

function renderViewer(): void {
  const viewerItems = getViewerItems();
  if (viewerItems.length === 0) {
    return;
  }

  viewerIndex = clampViewerIndex(viewerIndex, viewerItems.length);
  const item = viewerItems[viewerIndex];
  const imageUrl = item.imageUrl ?? "";
  const userInput = item.userInput ?? "";
  const caption = item.caption ?? "";
  const prompt = item.prompt ?? "";

  viewerPositionEl.textContent = `${viewerIndex + 1} / ${viewerItems.length}`;
  viewerImageIdEl.textContent = item.imageId ?? item.messageId ?? "画像";
  viewerCreatedAtEl.textContent = item.createdAt ? formatDisplayDate(item.createdAt) : "";
  viewerCreatedAtEl.dateTime = item.createdAt ?? "";
  viewerUserInputEl.textContent = userInput || "ユーザー入力は取得されていません";
  viewerCaptionEl.textContent = caption || "キャプションは取得されていません";
  viewerPromptEl.textContent = prompt || "生成プロンプトは取得されていません";
  viewerCopyUserInputButton.disabled = !userInput;
  viewerCopyCaptionButton.disabled = !caption;
  viewerCopyPromptButton.disabled = !prompt;
  viewerDownloadButton.disabled = !imageUrl;
  viewerCopyImageButton.disabled = !imageUrl;
  viewerImage.hidden = false;
  viewerImageStatus.hidden = true;
  viewerImageStatus.textContent = "";
  viewerImage.alt = caption || item.imageId || "ChatGPT生成画像";
  viewerImage.src = imageUrl;
}

function moveViewer(delta: number): void {
  const viewerItems = getViewerItems();
  if (viewerItems.length === 0) {
    return;
  }

  viewerIndex = wrapViewerIndex(viewerIndex + delta, viewerItems.length);
  renderViewer();
}

function currentViewerItem(): ImageMetadata | undefined {
  const viewerItems = getViewerItems();
  if (viewerItems.length === 0) {
    return undefined;
  }

  return viewerItems[clampViewerIndex(viewerIndex, viewerItems.length)];
}

function imageItemKey(item: ImageMetadata): string {
  return item.imageId ?? item.messageId ?? item.imageUrl ?? item.capturedAt;
}

function clampViewerIndex(index: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function wrapViewerIndex(index: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  return ((index % length) + length) % length;
}

async function downloadCurrentViewerImage(): Promise<void> {
  const item = currentViewerItem();
  if (!item) {
    return;
  }

  await downloadSingleImage(item);
}

async function copyCurrentViewerImage(): Promise<void> {
  const item = currentViewerItem();
  if (!item?.imageUrl) {
    return;
  }

  viewerCopyImageButton.disabled = true;
  try {
    const response = await fetch(item.imageUrl, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`画像リクエストに失敗しました: ${response.status}`);
    }

    const sourceBlob = await response.blob();
    try {
      await writeImageBlobToClipboard(sourceBlob);
    } catch {
      await writeImageBlobToClipboard(await convertImageBlobToPng(sourceBlob));
    }
    setStatus("画像をクリップボードにコピーしました");
  } catch (error) {
    setStatus("画像のコピーに失敗しました");
    console.warn("Failed to copy image", error);
  } finally {
    viewerCopyImageButton.disabled = !currentViewerItem()?.imageUrl;
  }
}

async function copyViewerText(kind: "caption" | "prompt" | "userInput"): Promise<void> {
  const item = currentViewerItem();
  const value = kind === "caption" ? item?.caption : kind === "prompt" ? item?.prompt : item?.userInput;
  const label = kind === "caption" ? "キャプション" : kind === "prompt" ? "生成プロンプト" : "ユーザー入力";
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setStatus(`${label}をコピーしました`);
  } catch (error) {
    setStatus(`${label}のコピーに失敗しました`);
    console.warn(`Failed to copy ${kind}`, error);
  }
}

async function writeImageBlobToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type || "image/png"]: blob
    })
  ]);
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2Dコンテキストを取得できません");
    }
    context.drawImage(bitmap, 0, 0);
    return await canvasToBlob(canvas, "image/png");
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas変換に失敗しました"));
      }
    }, type);
  });
}

function renderEmpty(message: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  return empty;
}

function renderError(message: string): void {
  countEl.textContent = "0";
  downloadSelectedButton.disabled = true;
  selectionToggleButton.disabled = true;
  exportJsonButton.disabled = true;
  closeViewer();

  const error = document.createElement("div");
  error.className = "error";
  error.textContent = message;
  contentEl.replaceChildren(error);
}

function localizeErrorMessage(message: string): string {
  if (message.includes("Side panel DOM is missing")) {
    return "サイドパネルの初期化に失敗しました。拡張機能を再読み込みしてください。";
  }
  return message || "不明なエラー";
}

type PreparedImageDownload = {
  imageFile: ZipFileEntry;
  sidecarFile?: ZipFileEntry;
  embedded: boolean;
};

async function downloadSingleImage(item: ImageMetadata): Promise<void> {
  hideDownloadProgress();
  setBusy(true);
  setStatus("画像を保存中");

  try {
    const prepared = await prepareImageDownload(item);
    if (!prepared) {
      setStatus("この画像のURLはまだ取得できていません");
    } else {
      await downloadPreparedImage(prepared);
      if (prepared.embedded) {
        setStatus(`${prepared.imageFile.path} を保存しました（メタデータ埋め込み済み）`);
      } else {
        setStatus(`${prepared.imageFile.path} を保存しました（JSON同梱）`);
      }
    }
  } finally {
    setBusy(false);
  }
}

async function downloadPreparedImage(prepared: PreparedImageDownload): Promise<void> {
  await downloadBlob(
    new Blob([blobPartFromBytes(prepared.imageFile.data)], { type: mimeTypeFromPath(prepared.imageFile.path) }),
    `GPT Image Viewer/${prepared.imageFile.path}`
  );

  if (prepared.sidecarFile) {
    await downloadBlob(
      new Blob([blobPartFromBytes(prepared.sidecarFile.data)], { type: "application/json" }),
      `GPT Image Viewer/${prepared.sidecarFile.path}`
    );
  }
}

async function downloadSelectedImages(): Promise<void> {
  await downloadImagesAsZip(getSelectedDownloadableItems());
}

async function downloadImagesAsZip(sourceItems: ImageMetadata[]): Promise<void> {
  const items = sourceItems.filter((item) => item.imageUrl);
  const skipped = sourceItems.length - items.length;
  if (items.length === 0) {
    setStatus("保存できる選択画像がありません");
    return;
  }

  if (!(await confirmDownloadZip(items.length, skipped))) {
    return;
  }

  setBusy(true);
  let sidecars = 0;
  let failed = 0;
  const files: ZipFileEntry[] = [];

  try {
    for (const [index, item] of items.entries()) {
      updateDownloadProgress("画像を準備中", index, items.length);
      setStatus(`ZIPを準備中 ${index + 1}/${items.length}`);
      try {
        const prepared = await prepareImageDownload(item);
        if (!prepared) {
          failed += 1;
          continue;
        }

        files.push(prepared.imageFile);
        if (prepared.sidecarFile) {
          files.push(prepared.sidecarFile);
          sidecars += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("Failed to prepare image download", error);
      } finally {
        updateDownloadProgress("画像を準備中", index + 1, items.length);
      }
    }

    if (files.length === 0) {
      updateDownloadProgress("ZIPに追加できる画像がありません", items.length, items.length);
      setStatus("ZIPに追加できる画像がありませんでした");
      return;
    }

    updateDownloadProgress("ZIPを作成中", items.length, items.length);
    const zipBytes = createZipArchive(dedupeZipEntries(files));
    const zipFilename = `GPT Image Viewer/${createZipBaseName()}.zip`;
    await downloadBlob(new Blob([blobPartFromBytes(zipBytes)], { type: "application/zip" }), zipFilename);

    const downloadedImages = items.length - failed;
    const parts = [`${downloadedImages}/${items.length}件をZIPで保存しました`];
    if (sidecars > 0) {
      parts.push(`JSON同梱 ${sidecars}件`);
    }
    if (failed > 0) {
      parts.push(`失敗 ${failed}件`);
    }
    if (skipped > 0) {
      parts.push(`画像未取得をスキップ ${skipped}件`);
    }
    updateDownloadProgress("保存を開始しました", items.length, items.length);
    setStatus(parts.join("、"));
  } finally {
    setBusy(false);
  }
}

async function prepareImageDownload(item: ImageMetadata): Promise<PreparedImageDownload | undefined> {
  if (!item.imageUrl) {
    return undefined;
  }

  const response = await fetch(item.imageUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`画像リクエストに失敗しました: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? undefined;
  const sourceBytes = new Uint8Array(await response.arrayBuffer());
  const embedded = embedImageMetadataSafely(sourceBytes, item);
  const extension = extensionForImage(embedded.format, contentType, item.imageUrl);
  const baseName = createImageBaseName(item);
  const imageFilename = `${baseName}.${extension}`;
  const modifiedAt = dateFromMetadata(item);
  const imageFile: ZipFileEntry = {
    path: imageFilename,
    data: embedded.bytes,
    modifiedAt
  };

  const sidecarFile = embedded.embedded
    ? undefined
    : {
        path: `${baseName}.json`,
        data: utf8Bytes(createSidecarJson(item, imageFilename, embedded.reason)),
        modifiedAt
      };

  return {
    imageFile,
    sidecarFile,
    embedded: embedded.embedded
  };
}

function embedImageMetadataSafely(
  bytes: Uint8Array,
  item: ImageMetadata
): { bytes: Uint8Array; format?: SupportedImageFormat; embedded: boolean; reason?: string } {
  try {
    return embedImageMetadata(bytes, item);
  } catch (error) {
    return {
      bytes,
      embedded: false,
      reason: error instanceof Error ? error.message : "メタデータ埋め込みに失敗しました"
    };
  }
}

function blobPartFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}

function createSidecarJson(item: ImageMetadata, imageFilename: string, reason?: string): string {
  const payload = {
    ...createMetadataExport([item]),
    download: {
      imageFilename,
      embedded: false,
      reason: reason ?? "メタデータ埋め込みを利用できませんでした"
    }
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function dedupeZipEntries(files: ZipFileEntry[]): ZipFileEntry[] {
  const counts = new Map<string, number>();
  return files.map((file) => {
    const count = counts.get(file.path) ?? 0;
    counts.set(file.path, count + 1);
    if (count === 0) {
      return file;
    }

    const path = file.path.replace(/(\.[^./]+)?$/, `-${count + 1}$1`);
    return { ...file, path };
  });
}

function createZipBaseName(): string {
  const conversationId = conversationIdEl.textContent && conversationIdEl.textContent !== "-" ? conversationIdEl.textContent : "images";
  const timestamp = formatTimestampForFilename(new Date().toISOString());
  return sanitizeFilenamePart(`${timestamp}-${conversationId}-selected`).slice(0, 140) || "chatgpt-images";
}

function dateFromMetadata(item: ImageMetadata): Date {
  const date = new Date(item.createdAt ?? item.capturedAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function mimeTypeFromPath(path: string): string {
  const extension = extensionFromUrl(path);
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "json") {
    return "application/json";
  }
  return "application/octet-stream";
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function createImageBaseName(item: ImageMetadata): string {
  const timestamp = formatTimestampForFilename(item.createdAt ?? item.capturedAt);
  const identity = item.imageId ?? item.messageId ?? "image";
  return sanitizeFilenamePart(`${timestamp}-${identity}`).slice(0, 140) || "chatgpt-image";
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

function extensionForImage(format?: SupportedImageFormat, contentType?: string, imageUrl?: string): string {
  if (format === "png" || contentType?.includes("image/png")) {
    return "png";
  }
  if (format === "jpeg" || contentType?.includes("image/jpeg")) {
    return "jpg";
  }
  if (format === "webp" || contentType?.includes("image/webp")) {
    return "webp";
  }

  const extension = extensionFromUrl(imageUrl);
  return extension ?? "img";
}

function extensionFromUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) {
    return undefined;
  }

  const directMatch = /\.([a-z0-9]{2,5})$/i.exec(imageUrl);
  if (directMatch?.[1]) {
    return directMatch[1].toLowerCase();
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(pathname);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function exportJson(): void {
  const items = getVisibleItems();
  if (items.length === 0) {
    return;
  }
  moreActionsMenu.open = false;

  const payload = createMetadataExport(items);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chatgpt-image-metadata-${formatTimestampForFilename(payload.exportedAt)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`メタデータJSON ${items.length}件を書き出しました`);
}

async function exportDictionary(): Promise<void> {
  const payload = await createImageUrlRecordsExport();
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gpt-image-viewer-url-dictionary-${formatTimestampForFilename(payload.exportedAt)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`辞書レコード ${payload.records.length}件を書き出しました`);
}

async function importDictionaryFromFile(file: File): Promise<void> {
  const payload = JSON.parse(await file.text()) as unknown;
  const importedCount = await importImageUrlRecords(payload);
  setStatus(`辞書レコード ${importedCount}件を読み込みました`);
  scheduleLoadCurrentConversation({ collectPageImages: false });
}

async function clearDictionary(): Promise<void> {
  if (!(await confirmClearDictionary())) {
    return;
  }

  await clearImageUrlRecords();
  setStatus("辞書を全削除しました");
  scheduleLoadCurrentConversation({ collectPageImages: false, status: "辞書なしで再読み込み中" });
}

function confirmClearDictionary(): Promise<boolean> {
  return confirmDialog(clearDictionaryDialog, "このブラウザセッションの画像URL辞書を全削除しますか？");
}

function confirmDownloadZip(imageCount: number, skippedCount: number): Promise<boolean> {
  const targetText = "選択した画像";
  const skippedText = skippedCount > 0 ? ` 画像未取得の ${skippedCount}件はスキップされます。` : "";
  downloadAllMessage.textContent = `${targetText} ${imageCount}件を1つのZIPファイルとして保存します。${skippedText}`;
  return confirmDialog(downloadAllDialog, `${targetText} ${imageCount}件をZIPで保存しますか？`);
}

function confirmDialog(dialog: HTMLDialogElement, fallbackMessage: string): Promise<boolean> {
  if (typeof dialog.showModal !== "function") {
    return Promise.resolve(confirm(fallbackMessage));
  }

  if (dialog.open) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    dialog.returnValue = "cancel";
    dialog.addEventListener(
      "close",
      () => {
        resolve(dialog.returnValue === "confirm");
      },
      { once: true }
    );
    dialog.showModal();
  });
}

function handleSessionStorageChange(changes: Record<string, chrome.storage.StorageChange>): void {
  const changedKeys = Object.keys(changes);
  const hasDictionaryChange = IMAGE_URL_RECORDS_KEY in changes;
  const hasConversationChange = changedKeys.some((key) => key.startsWith("captured-conversation:"));

  if (hasConversationChange) {
    scheduleAutoPageLoad();
  } else if (hasDictionaryChange) {
    scheduleLoadCurrentConversation({ collectPageImages: false });
  }
}

function scheduleAutoPageLoad(): void {
  scheduleLoadCurrentConversation({
    collectPageImages: true,
    pageImageScanAttempts: AUTO_PAGE_IMAGE_SCAN_ATTEMPTS,
    pageImageScanDelayMs: AUTO_PAGE_IMAGE_SCAN_DELAY_MS
  });
}

function wireAutoRefreshEvents(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session") {
      handleSessionStorageChange(changes);
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    scheduleAutoPageLoad();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url && changeInfo.status !== "complete") {
      return;
    }

    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      if (tab?.id === tabId) {
        scheduleAutoPageLoad();
      }
    });
  });
}

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTimestampForFilename(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

refreshButton.addEventListener("click", () => {
  void loadCurrentConversation({
    pageImageScanAttempts: AUTO_PAGE_IMAGE_SCAN_ATTEMPTS,
    pageImageScanDelayMs: AUTO_PAGE_IMAGE_SCAN_DELAY_MS
  });
});
showAttachmentsToggle.addEventListener("change", () => {
  showUserAttachments = showAttachmentsToggle.checked;
  renderCurrentItems();
  const hiddenCount = countHiddenUserAttachments(currentItems);
  setStatus(showUserAttachments ? "添付画像を表示しています" : `添付画像を非表示にしました（${hiddenCount}件）`);
});
selectionToggleButton.addEventListener("click", toggleSelectAllDownloadableItems);
downloadSelectedButton.addEventListener("click", () => {
  void downloadSelectedImages().catch((error: unknown) => {
    setStatus("選択画像の保存に失敗しました");
    console.warn("Failed to download selected images", error);
  });
});
viewerCloseButton.addEventListener("click", closeViewer);
viewerDialog.addEventListener("close", () => {
  viewerIndex = -1;
  viewerImage.removeAttribute("src");
});
viewerDialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveViewer(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveViewer(1);
  }
});
viewerImage.addEventListener("error", () => {
  viewerImage.hidden = true;
  viewerImageStatus.hidden = false;
  viewerImageStatus.textContent = "画像を表示できません";
  viewerCopyImageButton.disabled = true;
});
viewerPrevButton.addEventListener("click", () => moveViewer(-1));
viewerNextButton.addEventListener("click", () => moveViewer(1));
viewerPrevEdgeButton.addEventListener("click", () => moveViewer(-1));
viewerNextEdgeButton.addEventListener("click", () => moveViewer(1));
viewerDownloadButton.addEventListener("click", () => {
  void downloadCurrentViewerImage().catch((error: unknown) => {
    setStatus("画像の保存に失敗しました");
    console.warn("Failed to download viewer image", error);
  });
});
viewerCopyImageButton.addEventListener("click", () => {
  void copyCurrentViewerImage();
});
viewerCopyUserInputButton.addEventListener("click", () => {
  void copyViewerText("userInput");
});
viewerCopyCaptionButton.addEventListener("click", () => {
  void copyViewerText("caption");
});
viewerCopyPromptButton.addEventListener("click", () => {
  void copyViewerText("prompt");
});
exportJsonButton.addEventListener("click", exportJson);
exportDictionaryButton.addEventListener("click", () => {
  moreActionsMenu.open = false;
  void exportDictionary().catch((error: unknown) => {
    setStatus("辞書の書き出しに失敗しました");
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : "不明なエラー");
  });
});
importDictionaryButton.addEventListener("click", () => {
  moreActionsMenu.open = false;
  dictionaryFileInput.click();
});
clearDictionaryButton.addEventListener("click", () => {
  moreActionsMenu.open = false;
  void clearDictionary().catch((error: unknown) => {
    setStatus("辞書の全削除に失敗しました");
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : "不明なエラー");
  });
});
dictionaryFileInput.addEventListener("change", () => {
  const file = dictionaryFileInput.files?.[0];
  dictionaryFileInput.value = "";
  if (!file) {
    return;
  }

  void importDictionaryFromFile(file).catch((error: unknown) => {
    setStatus("辞書の読み込みに失敗しました");
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : "不明なエラー");
  });
});

wireAutoRefreshEvents();
void loadCurrentConversation({
  pageImageScanAttempts: AUTO_PAGE_IMAGE_SCAN_ATTEMPTS,
  pageImageScanDelayMs: AUTO_PAGE_IMAGE_SCAN_DELAY_MS
});
