import type { ImageMetadata } from "../metadata/types";
import { embedImageMetadata, type SupportedImageFormat } from "../metadata/embed-image-metadata";
import { createMetadataExport, stripRawMetadata } from "../metadata/write-metadata";
import { loadCapturedConversation } from "../shared/capture-store";
import { classifyChatGptPageUrl } from "../shared/chatgpt-url";
import {
  clearImageUrlRecords,
  createImageUrlRecordsExport,
  getImageUrlRecordStats,
  IMAGE_URL_RECORDS_KEY,
  importImageUrlRecords,
  loadImageUrlRecords,
  mergeImageUrlRecord,
  saveImageUrlRecords,
  type ImageUrlRecord,
  type ImageUrlRecordStats
} from "../shared/image-url-store";
import { ZipBlobBuilder, type ZipFileEntry } from "../shared/zip";
import {
  createChatFolderName,
  createFailureReportJson,
  createFolderSaveFailure,
  createFolderSaveFailureReport,
  createFolderSaveRootName,
  getUniqueDirectoryHandle,
  getUniqueFileHandle,
  writeFile,
  type DirectoryHandleLike,
  type FolderSaveFailure,
  type PreparedFolderFile
} from "./folder-save";
import { getMessages, type LoadedStatusInput, type MessageCatalog } from "./messages";

type IconName = "refresh" | "save" | "copy" | "export" | "import" | "trash" | "scroll";

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

type LoadedConversationMetadata = {
  items: ImageMetadata[];
  statusPrefix: string;
  conversationTitle?: string;
};

type AutoScrollStepResult = {
  available: boolean;
  moved: boolean;
  scrollTop: number;
  scrollHeight: number;
};

type ToolbarMode = "conversation" | "images" | "other";

const { locale, messages } = getMessages();

document.documentElement.lang = locale;
applyStaticMessages(messages);

const AUTO_PAGE_IMAGE_SCAN_ATTEMPTS = 5;
const AUTO_PAGE_IMAGE_SCAN_DELAY_MS = 400;

const statusEl = queryRequired<HTMLParagraphElement>("#status");
const countEl = queryRequired<HTMLSpanElement>("#item-count");
const conversationDetailsEl = queryRequired<HTMLDetailsElement>("#conversation-details");
const conversationTitleEl = queryRequired<HTMLSpanElement>("#conversation-title");
const conversationIdEl = queryRequired<HTMLSpanElement>("#conversation-id");
const contentEl = queryRequired<HTMLElement>("#content");
const refreshButton = queryRequired<HTMLButtonElement>("#refresh");
const imagePageScrollButton = queryRequired<HTMLButtonElement>("#image-page-scroll");
const saveImportedImagesButton = queryRequired<HTMLButtonElement>("#save-imported-images");
const toolbarViewGroup = queryRequired<HTMLElement>(".toolbar-view");
const activityStatusEl = queryRequired<HTMLElement>("#activity-status");
const dataDetailsEl = queryRequired<HTMLDetailsElement>("#data-details");
const chatDataSummaryEl = queryRequired<HTMLElement>("#chat-data-summary");
const imageImportSummaryEl = queryRequired<HTMLElement>("#image-import-summary");
const showAttachmentsToggle = queryRequired<HTMLInputElement>("#show-attachments");
const selectionSummaryEl = queryRequired<HTMLSpanElement>("#selection-summary");
const selectionToggleButton = queryRequired<HTMLButtonElement>("#selection-toggle");
const downloadSelectedButton = queryRequired<HTMLButtonElement>("#download-selected");
const moreActionsMenu = queryRequired<HTMLDetailsElement>("#more-actions");
const moreActionsPanel = queryRequired<HTMLElement>(".toolbar-menu-panel");
const saveImportedImagesMenuButton = queryRequired<HTMLButtonElement>("#save-imported-images-menu");
const exportJsonButton = queryRequired<HTMLButtonElement>("#export-json");
const exportDictionaryButton = queryRequired<HTMLButtonElement>("#export-dictionary");
const importDictionaryButton = queryRequired<HTMLButtonElement>("#import-dictionary");
const clearDictionaryButton = queryRequired<HTMLButtonElement>("#clear-dictionary");
const dictionaryFileInput = queryRequired<HTMLInputElement>("#dictionary-file");
const downloadProgress = queryRequired<HTMLElement>("#download-progress");
const downloadProgressLabel = queryRequired<HTMLSpanElement>("#download-progress-label");
const downloadProgressCount = queryRequired<HTMLSpanElement>("#download-progress-count");
const downloadProgressBar = queryRequired<HTMLProgressElement>("#download-progress-bar");
const cancelFolderSaveButton = queryRequired<HTMLButtonElement>("#cancel-folder-save");
const folderSaveFailures = queryRequired<HTMLElement>("#folder-save-failures");
const folderSaveFailureList = queryRequired<HTMLOListElement>("#folder-save-failure-list");
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
let currentChatDataSummary: LoadedStatusInput | undefined;
let selectedItemKeys = new Set<string>();
let showUserAttachments = false;
let isPanelBusy = false;
let toolbarMode: ToolbarMode = "other";
let isImagePageAutoScrollRunning = false;
let folderSaveAbortController: AbortController | undefined;
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

function applyStaticMessages(catalog: MessageCatalog): void {
  document.title = catalog.ui.appTitle;

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const value = resolveMessagePath(catalog, element.dataset.i18n);
    if (value !== undefined) {
      element.textContent = value;
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    const value = resolveMessagePath(catalog, element.dataset.i18nAriaLabel);
    if (value !== undefined) {
      element.setAttribute("aria-label", value);
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const value = resolveMessagePath(catalog, element.dataset.i18nTitle);
    if (value !== undefined) {
      element.setAttribute("title", value);
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-alt]")) {
    const value = resolveMessagePath(catalog, element.dataset.i18nAlt);
    if (value !== undefined) {
      element.setAttribute("alt", value);
    }
  }
}

function resolveMessagePath(catalog: MessageCatalog, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  let value: unknown = catalog;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !(part in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return typeof value === "string" ? value : undefined;
}

function applyButtonIcons(): void {
  decorateButton(refreshButton, "refresh");
  decorateButton(imagePageScrollButton, "scroll");
  decorateButton(saveImportedImagesButton, "save");
  decorateButton(saveImportedImagesMenuButton, "save");
  decorateButton(downloadSelectedButton, "save");
  decorateButton(exportJsonButton, "export");
  decorateButton(exportDictionaryButton, "export");
  decorateButton(importDictionaryButton, "import");
  decorateButton(clearDictionaryButton, "trash");
  decorateButton(confirmClearDictionaryButton(), "trash");
  decorateButton(confirmDownloadZipButton(), "save");
  decorateButton(viewerDownloadButton, "save");
  decorateButton(viewerCopyImageButton, "copy");
  decorateButton(viewerCopyUserInputButton, "copy");
  decorateButton(viewerCopyCaptionButton, "copy");
  decorateButton(viewerCopyPromptButton, "copy");
}

function confirmClearDictionaryButton(): HTMLButtonElement {
  return queryRequired<HTMLButtonElement>("#confirm-clear-dictionary");
}

function confirmDownloadZipButton(): HTMLButtonElement {
  return queryRequired<HTMLButtonElement>("#confirm-download-all");
}

function decorateButton(button: HTMLButtonElement, icon: IconName): void {
  if (button.querySelector(".button-icon")) {
    return;
  }

  button.classList.add("has-icon");
  button.prepend(createIcon(icon));
}

function createIcon(icon: IconName): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "button-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = iconSvg[icon];
  return span;
}

const iconSvg: Record<IconName, string> = {
  refresh:
    '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
  scroll:
    '<svg viewBox="0 0 24 24"><path d="M12 4v14"/><path d="m7 13 5 5 5-5"/><path d="M5 4h14"/></svg>'
};

applyButtonIcons();

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function setActivityStatus(message?: string): void {
  activityStatusEl.hidden = !message;
  activityStatusEl.textContent = message ?? "";
}

function resetDataDetails(): void {
  currentChatDataSummary = undefined;
  dataDetailsEl.hidden = false;
  chatDataSummaryEl.textContent = messages.ui.notAvailable;
  imageImportSummaryEl.textContent = messages.ui.notAvailable;
}

function showDataDetails(): void {
  dataDetailsEl.hidden = false;
}

function setChatDataSummary(input?: LoadedStatusInput): void {
  currentChatDataSummary = input;
  showDataDetails();
  chatDataSummaryEl.textContent = input ? messages.ui.chatDataSummary(input) : messages.ui.notAvailable;
}

function updateChatDataSummaryForVisibleItems(): void {
  if (!currentChatDataSummary) {
    return;
  }

  setChatDataSummary({
    ...currentChatDataSummary,
    itemCount: getVisibleItems().length,
    hiddenAttachmentCount: countHiddenUserAttachments(currentItems),
    showUserAttachments
  });
}

function setImageImportSummary(stats?: ImageUrlRecordStats): void {
  showDataDetails();
  imageImportSummaryEl.textContent = stats
    ? messages.ui.imageImportSummary({
        totalRecordCount: stats.totalRecordCount,
        recentImageGenRecordCount: stats.recentImageGenRecordCount,
        recentImageGenLinkedConversationCount: stats.recentImageGenLinkedConversationCount,
        latestCapturedLabel: stats.latestRecentImageGenCapturedAt ? formatDisplayDate(stats.latestRecentImageGenCapturedAt) : undefined
      })
    : messages.ui.notAvailable;
}

function setConversationInfo(conversationId?: string, conversationTitle?: string): void {
  conversationDetailsEl.hidden = false;
  conversationTitleEl.textContent = conversationTitle || messages.ui.noChatSelected;
  conversationIdEl.textContent = conversationId || "-";
}

function setToolbarMode(mode: ToolbarMode): void {
  toolbarMode = mode;
  updateToolbarControls();
}

function positionMoreActionsMenu(): void {
  if (!moreActionsMenu.open) {
    moreActionsPanel.style.left = "";
    return;
  }

  window.requestAnimationFrame(() => {
    const margin = 8;
    const menuRect = moreActionsMenu.getBoundingClientRect();
    const summaryRect = moreActionsMenu.querySelector("summary")?.getBoundingClientRect() ?? menuRect;
    const panelWidth = moreActionsPanel.offsetWidth;
    const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    const desiredLeft = summaryRect.left + summaryRect.width / 2 - panelWidth / 2;
    const viewportLeft = Math.min(Math.max(desiredLeft, margin), maxLeft);
    moreActionsPanel.style.left = `${viewportLeft - menuRect.left}px`;
  });
}

function updateToolbarControls(): void {
  const isConversationPage = toolbarMode === "conversation";
  const isImagesPage = toolbarMode === "images";

  refreshButton.hidden = !isConversationPage;
  toolbarViewGroup.hidden = !isConversationPage;
  imagePageScrollButton.hidden = !isImagesPage && !isImagePageAutoScrollRunning;
  saveImportedImagesButton.hidden = !isImagesPage;
  saveImportedImagesMenuButton.hidden = isImagesPage;
  imagePageScrollButton.disabled = (!isImagesPage && !isImagePageAutoScrollRunning) || (isPanelBusy && !isImagePageAutoScrollRunning);
  saveImportedImagesButton.disabled = isPanelBusy;
  saveImportedImagesMenuButton.disabled = isPanelBusy;
  imagePageScrollButton.textContent = isImagePageAutoScrollRunning
    ? messages.ui.buttons.stopImagePageScroll
    : messages.ui.buttons.startImagePageScroll;
  decorateButton(imagePageScrollButton, "scroll");
  positionMoreActionsMenu();
}

function hideDownloadProgress(): void {
  downloadProgress.hidden = true;
  cancelFolderSaveButton.hidden = true;
  cancelFolderSaveButton.disabled = false;
  downloadProgressLabel.textContent = "";
  downloadProgressCount.textContent = "";
  downloadProgressBar.value = 0;
  downloadProgressBar.max = 1;
}

function showFolderSaveCancel(): void {
  cancelFolderSaveButton.hidden = false;
  cancelFolderSaveButton.disabled = false;
}

function hideFolderSaveFailures(): void {
  folderSaveFailures.hidden = true;
  folderSaveFailureList.replaceChildren();
}

function renderFolderSaveFailures(failures: FolderSaveFailure[]): void {
  if (failures.length === 0) {
    hideFolderSaveFailures();
    return;
  }

  const visibleFailures = failures.slice(0, 20);
  folderSaveFailureList.replaceChildren(
    ...visibleFailures.map((failure) => {
      const item = document.createElement("li");
      const identity = failure.imageId ?? failure.messageId ?? failure.conversationId ?? messages.labels.image;
      item.textContent = `${identity}: ${failure.reason}`;
      return item;
    })
  );

  if (failures.length > visibleFailures.length) {
    const item = document.createElement("li");
    item.textContent = messages.status.folderSaveFailureListTruncated(failures.length - visibleFailures.length);
    folderSaveFailureList.append(item);
  }

  folderSaveFailures.hidden = false;
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
  setToolbarMode("other");
  setBusy(true);
  hideDownloadProgress();
  hideFolderSaveFailures();
  currentItems = [];
  currentPreviewUrls = new Map();
  currentChatDataSummary = undefined;
  selectedItemKeys = new Set();
  setConversationInfo();
  resetDataDetails();
  if (!isImagePageAutoScrollRunning) {
    setActivityStatus();
  }
  setStatus(options.status ?? messages.status.loadingCurrentChat);
  renderEmptyContent(messages.empty.loading);

  try {
    const tab = await getActiveTab();
    const pageContext = classifyChatGptPageUrl(tab.url);
    setToolbarMode(pageContext.kind === "conversation" ? "conversation" : pageContext.kind === "images" ? "images" : "other");

    if (sequence !== loadSequence) {
      return;
    }

    if (!tab.id) {
      resetCurrentView(messages.status.outsideChatGpt, messages.empty.outsideChatGpt);
      return;
    }

    if (pageContext.kind === "unsupported") {
      resetCurrentView(messages.status.outsideChatGpt, messages.empty.outsideChatGpt);
      return;
    }

    const imageUrlRecords = await loadImageUrlRecords().catch((error: unknown) => {
      console.warn("Failed to load image URL records", error);
      return new Map<string, ImageUrlRecord>();
    });

    if (sequence !== loadSequence) {
      return;
    }

    setImageImportSummary(getImageUrlRecordStats(imageUrlRecords.values()));

    if (pageContext.kind === "images") {
      resetCurrentView(messages.status.chatGptImagesPage, messages.empty.chatGptImagesPage);
      setImageImportSummary(getImageUrlRecordStats(imageUrlRecords.values()));
      return;
    }

    if (pageContext.kind === "chatgpt") {
      resetCurrentView(messages.status.chatGptNonChatPage, messages.empty.chatGptNonChatPage);
      setImageImportSummary(getImageUrlRecordStats(imageUrlRecords.values()));
      return;
    }

    setConversationInfo(pageContext.conversationId);

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
    const pageRecords = pageImages.map((image) => pageImageToUrlRecord(image, capturedAt));
    mergeImageUrlRecords(imageUrlRecords, pageRecords);
    if (shouldCollectPageImages) {
      await saveImageUrlRecords(pageRecords).catch((error: unknown) => {
        console.warn("Failed to save page image URL records", error);
      });
      setImageImportSummary(getImageUrlRecordStats(imageUrlRecords.values()));
    }

    if (sequence !== loadSequence) {
      return;
    }

    let imageUrls = imageUrlMapFromRecords(imageUrlRecords);
    const loaded = await loadConversationMetadata(pageContext.conversationId, imageUrls);
    if (!loaded) {
      resetCurrentView(messages.status.chatDataNotCaptured, messages.empty.chatDataNotCaptured);
      setConversationInfo(pageContext.conversationId);
      setImageImportSummary(getImageUrlRecordStats(imageUrlRecords.values()));
      return;
    }

    setConversationInfo(pageContext.conversationId, loaded.conversationTitle);
    currentItems = sortItems(applyImageUrlRecords(loaded.items, imageUrlRecords).map(stripRawMetadata));
    currentPreviewUrls = previewUrlMapFromRecords(imageUrlRecords);
    imageUrls = imageUrlMapFromRecords(imageUrlRecords);

    if (currentItems.length === 0) {
      setStatus(messages.status.noImagesInConversation);
      setChatDataSummary(
        createChatDataSummaryInput(loaded.statusPrefix, 0, pageImages.length, 0, imageUrlRecords.size, 0, countHiddenUserAttachments(currentItems))
      );
      renderEmptyContent(messages.empty.noImagesInConversation);
      return;
    }

    const visibleItems = getVisibleItems();
    setStatus(messages.status.chatLoaded);
    setChatDataSummary(
      createChatDataSummaryInput(
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
    currentChatDataSummary = undefined;
    selectedItemKeys = new Set();
    setConversationInfo();
    resetDataDetails();
    setStatus(messages.status.loadFailed);
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : messages.errors.unknown);
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
): Promise<LoadedConversationMetadata | undefined> {
  const snapshot = await loadCapturedConversation(conversationId);
  if (snapshot) {
    return {
      items: applyImageUrls(stripImageUrls(snapshot.items), imageUrls),
      statusPrefix: messages.status.loadedPrefix,
      conversationTitle: snapshot.conversationTitle
    };
  }

  return undefined;
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
      caption: item.caption ?? record.caption ?? record.title,
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

function createChatDataSummaryInput(
  statusPrefix: string,
  itemCount: number,
  pageUrlCount: number,
  matchedUrlRecordCount: number,
  storedUrlRecordCount: number,
  missingUrlCount: number,
  hiddenAttachmentCount: number
): LoadedStatusInput {
  return {
    statusPrefix,
    itemCount,
    pageUrlCount,
    matchedUrlRecordCount,
    storedUrlRecordCount,
    missingUrlCount,
    hiddenAttachmentCount,
    showUserAttachments
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    throw new Error(messages.errors.activeTabMissing);
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
  isPanelBusy = isBusy;
  refreshButton.disabled = isBusy;
  showAttachmentsToggle.disabled = isBusy;
  cancelFolderSaveButton.disabled = !folderSaveAbortController;
  saveImportedImagesButton.disabled = isBusy;
  saveImportedImagesMenuButton.disabled = isBusy;
  updateSelectionControls(isBusy);
  exportJsonButton.disabled = isBusy || getVisibleItems().length === 0;
  exportDictionaryButton.disabled = isBusy;
  importDictionaryButton.disabled = isBusy;
  clearDictionaryButton.disabled = isBusy;
  updateToolbarControls();
  if (isBusy) {
    moreActionsMenu.open = false;
  }
}

function resetCurrentView(statusMessage: string, emptyMessage: string): void {
  currentItems = [];
  currentPreviewUrls = new Map();
  currentChatDataSummary = undefined;
  selectedItemKeys = new Set();
  setConversationInfo();
  resetDataDetails();
  setStatus(statusMessage);
  renderEmptyContent(emptyMessage);
  closeViewer();
}

function renderEmptyContent(message: string): void {
  pruneSelectedItems([]);
  countEl.textContent = "0";
  updateSelectionControls(false);
  exportJsonButton.disabled = true;
  contentEl.replaceChildren(renderEmpty(message));
  syncViewerAfterItemsChange();
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
        ? messages.empty.hiddenAttachments(hiddenCount)
        : messages.empty.noMetadata;
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
  notice.textContent = messages.notice.missingImages(missingCount);
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
    return renderThumbnailPlaceholder(messages.labels.imageMissing);
  }

  const wrapper = document.createElement("button");
  wrapper.className = "thumb";
  wrapper.type = "button";
  wrapper.setAttribute("aria-label", messages.labels.openViewer(item.imageId ?? item.messageId ?? messages.labels.image));
  wrapper.addEventListener("click", () => openViewerForItem(item));

  const image = document.createElement("img");
  image.alt = item.caption ?? item.imageId ?? messages.labels.generatedImageAlt;
  image.loading = "lazy";
  image.src = imageUrl;
  image.addEventListener("error", () => {
    wrapper.replaceWith(renderThumbnailPlaceholder(messages.viewer.imageUnavailable));
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
  selectText.textContent = messages.ui.selectImage;
  selectLabel.append(selectBox, selectText);

  const imageId = document.createElement("div");
  imageId.className = "image-id";
  imageId.textContent = item.imageId ?? item.messageId ?? messages.labels.image;

  const time = document.createElement("time");
  time.className = "image-time";
  time.textContent = item.createdAt ? formatDisplayDate(item.createdAt) : "";

  heading.append(selectLabel, imageId, time);
  main.append(heading);

  if (item.imageRole === "user_attachment") {
    const role = document.createElement("p");
    role.className = "image-text image-role-text";
    role.textContent = messages.labels.userAttachment;
    main.append(role);
  }

  if (item.userInput) {
    const text = document.createElement("p");
    text.className = "image-text";
    text.textContent = messages.labels.fieldLine(messages.labels.userInput, item.userInput);
    main.append(text);
  }

  const primaryText = item.caption
    ? messages.labels.fieldLine(messages.labels.caption, item.caption)
    : item.prompt
      ? messages.labels.fieldLine(messages.labels.prompt, item.prompt)
      : undefined;
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
  downloadButton.textContent = messages.ui.buttons.save;
  downloadButton.disabled = !item.imageUrl;
  decorateButton(downloadButton, "save");
  downloadButton.addEventListener("click", () => {
    void downloadSingleImage(item).catch((error: unknown) => {
      setActivityStatus(messages.status.imageSaveFailed);
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
  selectionSummaryEl.textContent = messages.ui.selectionSummary(selectedItems.length, downloadableItems.length);
  selectionToggleButton.textContent = allSelected ? messages.ui.buttons.clearSelection : messages.ui.buttons.selectAll;
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
  // Selection state is shown in the selection summary row.
}

function toggleSelectAllDownloadableItems(): void {
  const downloadableItems = getDownloadableItems();
  if (downloadableItems.length === 0) {
    setActivityStatus(messages.status.noSelectableImages);
    return;
  }

  if (areAllDownloadableItemsSelected()) {
    selectedItemKeys = new Set();
    renderCurrentItems();
    // Selection state is shown in the selection summary row.
    return;
  }

  selectedItemKeys = new Set(downloadableItems.map(imageItemKey));
  renderCurrentItems();
  // Selection state is shown in the selection summary row.
}

function getViewerItems(): ImageMetadata[] {
  return getVisibleItems().filter((item) => Boolean(item.imageUrl));
}

function openViewerForItem(item: ImageMetadata): void {
  const viewerItems = getViewerItems();
  const index = viewerItems.findIndex((candidate) => imageItemKey(candidate) === imageItemKey(item));
  if (index < 0) {
    setActivityStatus(messages.status.viewerNoImageUrl);
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
  viewerImageIdEl.textContent = item.imageId ?? item.messageId ?? messages.labels.image;
  viewerCreatedAtEl.textContent = item.createdAt ? formatDisplayDate(item.createdAt) : "";
  viewerCreatedAtEl.dateTime = item.createdAt ?? "";
  viewerUserInputEl.textContent = userInput || messages.viewer.userInputMissing;
  viewerCaptionEl.textContent = caption || messages.viewer.captionMissing;
  viewerPromptEl.textContent = prompt || messages.viewer.promptMissing;
  viewerCopyUserInputButton.disabled = !userInput;
  viewerCopyCaptionButton.disabled = !caption;
  viewerCopyPromptButton.disabled = !prompt;
  viewerDownloadButton.disabled = !imageUrl;
  viewerCopyImageButton.disabled = !imageUrl;
  viewerImage.hidden = false;
  viewerImageStatus.hidden = true;
  viewerImageStatus.textContent = "";
  viewerImage.alt = caption || item.imageId || messages.labels.generatedImageAlt;
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
      throw new Error(messages.errors.imageRequestFailed(response.status));
    }

    const sourceBlob = await response.blob();
    try {
      await writeImageBlobToClipboard(sourceBlob);
    } catch {
      await writeImageBlobToClipboard(await convertImageBlobToPng(sourceBlob));
    }
    setActivityStatus(messages.status.imageCopied);
  } catch (error) {
    setActivityStatus(messages.status.imageCopyFailed);
    console.warn("Failed to copy image", error);
  } finally {
    viewerCopyImageButton.disabled = !currentViewerItem()?.imageUrl;
  }
}

async function copyViewerText(kind: "caption" | "prompt" | "userInput"): Promise<void> {
  const item = currentViewerItem();
  const value = kind === "caption" ? item?.caption : kind === "prompt" ? item?.prompt : item?.userInput;
  const label = kind === "caption" ? messages.labels.caption : kind === "prompt" ? messages.labels.prompt : messages.labels.userInput;
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setActivityStatus(messages.status.textCopied(label));
  } catch (error) {
    setActivityStatus(messages.status.textCopyFailed(label));
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
      throw new Error(messages.errors.canvasContextUnavailable);
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
        reject(new Error(messages.errors.canvasConversionFailed));
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
    return messages.errors.sidePanelInitFailed;
  }
  return message || messages.errors.unknown;
}

type PreparedImageDownload = {
  imageFile: ZipFileEntry;
  sidecarFile?: ZipFileEntry;
  embedded: boolean;
};

async function downloadSingleImage(item: ImageMetadata): Promise<void> {
  hideDownloadProgress();
  setBusy(true);
  setActivityStatus(messages.status.imageSaving);

  try {
    const prepared = await prepareImageDownload(item);
    if (!prepared) {
      setActivityStatus(messages.status.imageUrlMissing);
    } else {
      await downloadPreparedImage(prepared);
      if (prepared.embedded) {
        setActivityStatus(messages.status.imageSavedEmbedded(prepared.imageFile.path));
      } else {
        setActivityStatus(messages.status.imageSavedWithJson(prepared.imageFile.path));
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

async function downloadImportedImages(): Promise<void> {
  const showDirectoryPicker = getShowDirectoryPicker();
  if (!showDirectoryPicker) {
    setActivityStatus(messages.status.folderSaveUnsupported);
    return;
  }

  const records = await loadImageUrlRecords();
  const sourceItems = sortItems([...records.values()].map(imageUrlRecordToMetadata));
  const items = sourceItems.filter((item) => item.imageUrl);
  const skipped = sourceItems.length - items.length;

  if (items.length === 0) {
    setActivityStatus(messages.status.noImportedImagesToSave);
    return;
  }

  const conversationTitles = await loadConversationTitleMap(items);
  const conversationCount = new Set(items.map((item) => createChatFolderName(item, conversationTitles))).size;
  const selectedDirectory = await confirmImportedImagesDirectory(items.length, skipped, conversationCount, showDirectoryPicker);
  if (!selectedDirectory) {
    return;
  }

  const startedAt = new Date().toISOString();
  const root = await getUniqueDirectoryHandle(selectedDirectory, createFolderSaveRootName(startedAt, locale === "ja" ? "jst" : "utc"));
  const folderHandles = new Map<string, DirectoryHandleLike>();
  const failures: FolderSaveFailure[] = [];
  const controller = new AbortController();
  folderSaveAbortController = controller;
  setBusy(true);
  showFolderSaveCancel();
  hideFolderSaveFailures();

  let saved = 0;
  let sidecars = 0;
  let canceled = false;

  try {
    for (const [index, item] of items.entries()) {
      if (controller.signal.aborted) {
        canceled = true;
        break;
      }

      const folderName = createChatFolderName(item, conversationTitles);
      updateDownloadProgress(messages.progress.savingToFolder, index, items.length);
      setActivityStatus(messages.status.folderSaveSaving(index + 1, items.length));

      try {
        const folderHandle = await getOrCreateFolderHandle(root.handle, folderName, folderHandles);
        const prepared = await prepareImageDownload(item, controller.signal);
        if (!prepared) {
          failures.push(createFolderSaveFailure(item, messages.status.imageUrlMissing, { folder: folderName }));
          continue;
        }

        const imageName = await writePreparedFolderFile(folderHandle, {
          path: prepared.imageFile.path,
          data: prepared.imageFile.data,
          type: mimeTypeFromPath(prepared.imageFile.path)
        });
        saved += 1;

        if (prepared.sidecarFile) {
          await writePreparedFolderFile(folderHandle, {
            path: prepared.sidecarFile.path,
            data: prepared.sidecarFile.data,
            type: "application/json"
          });
          sidecars += 1;
        }

        void imageName;
      } catch (error) {
        if (controller.signal.aborted) {
          canceled = true;
          break;
        }
        failures.push(createFolderSaveFailure(item, errorToMessage(error), { folder: folderName }));
        console.warn("Failed to save imported image", error);
      } finally {
        updateDownloadProgress(messages.progress.savingToFolder, index + 1, items.length);
      }
    }

    const reportFilename = failures.length > 0 ? await saveFailureReport(root.handle, failures, startedAt).catch((error: unknown) => {
      console.warn("Failed to save folder save failure report", error);
      setActivityStatus(messages.status.folderSaveFailureReportFailed);
      return undefined;
    }) : undefined;

    renderFolderSaveFailures(failures);
    const parts = [
      canceled
        ? messages.status.folderSaveCanceled(saved, failures.length, items.length)
        : failures.length > 0
          ? messages.status.folderSaveCompletedWithFailures(saved, failures.length, items.length)
          : messages.status.folderSaveCompleted(saved, items.length)
    ];
    if (sidecars > 0) {
      parts.push(messages.labels.fieldLine(messages.labels.jsonIncluded, String(sidecars)));
    }
    if (skipped > 0) {
      parts.push(messages.status.zipSkippedMissing(skipped));
    }
    if (reportFilename) {
      parts.push(messages.status.folderSaveFailureReportSaved(reportFilename));
    }
    updateDownloadProgress(messages.progress.downloadStarted, items.length, items.length);
    setActivityStatus(parts.join(locale === "ja" ? "、" : ", "));
  } finally {
    folderSaveAbortController = undefined;
    cancelFolderSaveButton.hidden = true;
    setBusy(false);
  }
}

async function loadConversationTitleMap(items: ImageMetadata[]): Promise<Map<string, string>> {
  const conversationIds = [...new Set(items.map((item) => item.conversationId).filter((id): id is string => Boolean(id)))];
  const titles = new Map<string, string>();

  await Promise.all(
    conversationIds.map(async (conversationId) => {
      const snapshot = await loadCapturedConversation(conversationId).catch(() => undefined);
      if (snapshot?.conversationTitle) {
        titles.set(conversationId, snapshot.conversationTitle);
      }
    })
  );

  return titles;
}

function imageUrlRecordToMetadata(record: ImageUrlRecord): ImageMetadata {
  return stripRawMetadata({
    source: "chatgpt-web",
    conversationId: record.conversationId,
    messageId: record.messageId ?? record.recentItemId ?? record.generationId,
    imageId: record.imageId,
    imageUrl: record.imageUrl,
    prompt: record.prompt,
    caption: record.caption ?? record.title,
    imageRole: record.source === "recent-image-gen" ? "generated" : "unknown",
    createdAt: record.createdAt,
    capturedAt: record.capturedAt
  });
}

async function getOrCreateFolderHandle(
  rootHandle: DirectoryHandleLike,
  folderName: string,
  folderHandles: Map<string, DirectoryHandleLike>
): Promise<DirectoryHandleLike> {
  const existing = folderHandles.get(folderName);
  if (existing) {
    return existing;
  }

  const handle = await rootHandle.getDirectoryHandle(folderName, { create: true });
  folderHandles.set(folderName, handle);
  return handle;
}

async function writePreparedFolderFile(parent: DirectoryHandleLike, file: PreparedFolderFile): Promise<string> {
  const { handle, name } = await getUniqueFileHandle(parent, file.path);
  await writeFile(handle, file);
  return name;
}

async function saveFailureReport(rootHandle: DirectoryHandleLike, failures: FolderSaveFailure[], startedAt: string): Promise<string> {
  const filename = `gpt-image-viewer-failures-${formatTimestampForFilename(startedAt)}.json`;
  const report = createFolderSaveFailureReport(failures, new Date().toISOString());
  return await writePreparedFolderFile(rootHandle, {
    path: filename,
    data: utf8Bytes(createFailureReportJson(report)),
    type: "application/json"
  });
}

async function downloadImagesAsZip(sourceItems: ImageMetadata[]): Promise<void> {
  const items = sourceItems.filter((item) => item.imageUrl);
  const skipped = sourceItems.length - items.length;
  if (items.length === 0) {
    setActivityStatus(messages.status.noSelectedImagesToSave);
    return;
  }

  if (!(await confirmDownloadZip(items.length, skipped))) {
    return;
  }

  setBusy(true);
  let sidecars = 0;
  let failed = 0;
  const zipBuilder = new ZipBlobBuilder();
  const zipEntryCounts = new Map<string, number>();

  try {
    for (const [index, item] of items.entries()) {
      updateDownloadProgress(messages.progress.preparingImages, index, items.length);
      setActivityStatus(messages.status.zipPreparing(index + 1, items.length));
      try {
        const prepared = await prepareImageDownload(item);
        if (!prepared) {
          failed += 1;
          continue;
        }

        zipBuilder.addFile(dedupeZipEntry(prepared.imageFile, zipEntryCounts));
        if (prepared.sidecarFile) {
          zipBuilder.addFile(dedupeZipEntry(prepared.sidecarFile, zipEntryCounts));
          sidecars += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("Failed to prepare image download", error);
      } finally {
        updateDownloadProgress(messages.progress.preparingImages, index + 1, items.length);
      }
    }

    if (zipBuilder.fileCount === 0) {
      updateDownloadProgress(messages.progress.noZipFiles, items.length, items.length);
      setActivityStatus(messages.status.noZipFiles);
      return;
    }

    updateDownloadProgress(messages.progress.creatingZip, items.length, items.length);
    const zipFilename = `GPT Image Viewer/${createZipBaseName()}.zip`;
    await downloadBlob(zipBuilder.createBlob(), zipFilename);

    const downloadedImages = items.length - failed;
    const parts = [messages.status.zipSaved(downloadedImages, items.length)];
    if (sidecars > 0) {
      parts.push(messages.labels.fieldLine(messages.labels.jsonIncluded, String(sidecars)));
    }
    if (failed > 0) {
      parts.push(messages.status.zipFailed(failed));
    }
    if (skipped > 0) {
      parts.push(messages.status.zipSkippedMissing(skipped));
    }
    updateDownloadProgress(messages.progress.downloadStarted, items.length, items.length);
    setActivityStatus(parts.join(locale === "ja" ? "、" : ", "));
  } finally {
    setBusy(false);
  }
}

async function prepareImageDownload(item: ImageMetadata, signal?: AbortSignal): Promise<PreparedImageDownload | undefined> {
  if (!item.imageUrl) {
    return undefined;
  }

  const response = await fetch(item.imageUrl, { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(messages.errors.imageRequestFailed(response.status));
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
      reason: error instanceof Error ? error.message : messages.errors.metadataEmbeddingFailed
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
      reason: reason ?? messages.errors.metadataEmbeddingUnavailable
    }
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function dedupeZipEntry(file: ZipFileEntry, counts: Map<string, number>): ZipFileEntry {
  const count = counts.get(file.path) ?? 0;
  counts.set(file.path, count + 1);
  if (count === 0) {
    return file;
  }

  const path = file.path.replace(/(\.[^./]+)?$/, `-${count + 1}$1`);
  return { ...file, path };
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
  setActivityStatus(messages.status.metadataExported(items.length));
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
  setActivityStatus(messages.status.dictionaryExported(payload.records.length));
}

async function importDictionaryFromFile(file: File): Promise<void> {
  const payload = JSON.parse(await file.text()) as unknown;
  const importedCount = await importImageUrlRecords(payload);
  setActivityStatus(messages.status.dictionaryImported(importedCount));
  scheduleLoadCurrentConversation({ collectPageImages: false });
}

async function clearDictionary(): Promise<void> {
  if (!(await confirmClearDictionary())) {
    return;
  }

  await clearImageUrlRecords();
  setActivityStatus(messages.status.dictionaryCleared);
  scheduleLoadCurrentConversation({ collectPageImages: false });
}

function confirmClearDictionary(): Promise<boolean> {
  return confirmDialog(clearDictionaryDialog, messages.confirm.clearDictionaryFallback);
}

function confirmDownloadZip(imageCount: number, skippedCount: number): Promise<boolean> {
  const skippedText = skippedCount > 0 ? messages.confirm.skippedMissingImages(skippedCount) : "";
  downloadAllMessage.textContent = messages.confirm.zipMessage(imageCount, skippedText);
  confirmDownloadZipButton().textContent = messages.ui.buttons.saveZip;
  decorateButton(confirmDownloadZipButton(), "save");
  return confirmDialog(downloadAllDialog, messages.confirm.zipFallback(imageCount));
}

function confirmImportedImagesDirectory(
  imageCount: number,
  skippedCount: number,
  conversationCount: number,
  showDirectoryPicker: () => Promise<DirectoryHandleLike>
): Promise<DirectoryHandleLike | undefined> {
  downloadAllMessage.textContent = messages.confirm.importedImagesFolderMessage(imageCount, skippedCount, conversationCount);

  if (typeof downloadAllDialog.showModal !== "function") {
    if (!confirm(messages.confirm.importedImagesFolderFallback(imageCount))) {
      return Promise.resolve(undefined);
    }
    return showDirectoryPicker().catch(() => undefined);
  }

  if (downloadAllDialog.open) {
    return Promise.resolve(undefined);
  }

  const confirmButton = confirmDownloadZipButton();
  const previousText = confirmButton.textContent;
  confirmButton.textContent = messages.ui.buttons.chooseFolder;
  decorateButton(confirmButton, "save");

  return new Promise((resolve) => {
    let settled = false;

    function cleanup(): void {
      confirmButton.textContent = previousText ?? messages.ui.buttons.saveZip;
      confirmButton.disabled = false;
      confirmButton.removeEventListener("click", handleConfirmClick);
      downloadAllDialog.removeEventListener("close", handleClose);
      decorateButton(confirmButton, "save");
    }

    function finish(handle: DirectoryHandleLike | undefined): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(handle);
    }

    function handleClose(): void {
      finish(undefined);
    }

    function handleConfirmClick(event: MouseEvent): void {
      event.preventDefault();
      event.stopPropagation();
      confirmButton.disabled = true;
      void showDirectoryPicker()
        .then((handle) => {
          downloadAllDialog.removeEventListener("close", handleClose);
          downloadAllDialog.returnValue = "confirm";
          downloadAllDialog.close();
          finish(handle);
        })
        .catch(() => {
          downloadAllDialog.removeEventListener("close", handleClose);
          downloadAllDialog.returnValue = "cancel";
          downloadAllDialog.close();
          finish(undefined);
        });
    }

    downloadAllDialog.returnValue = "cancel";
    confirmButton.addEventListener("click", handleConfirmClick);
    downloadAllDialog.addEventListener("close", handleClose);
    downloadAllDialog.showModal();
  });
}

function getShowDirectoryPicker(): (() => Promise<DirectoryHandleLike>) | undefined {
  const candidate = (window as Window & {
    showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<DirectoryHandleLike>;
  }).showDirectoryPicker;

  if (typeof candidate !== "function") {
    return undefined;
  }

  return () => candidate.call(window, { id: "gpt-image-viewer-bulk-save", mode: "readwrite" });
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : messages.errors.unknown;
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

async function toggleImagePageAutoScroll(): Promise<void> {
  if (isImagePageAutoScrollRunning) {
    isImagePageAutoScrollRunning = false;
    updateToolbarControls();
    setActivityStatus(messages.status.imagePageScrollStopping);
    return;
  }

  const tab = await getActiveTab();
  const pageContext = classifyChatGptPageUrl(tab.url);
  if (!tab.id || pageContext.kind !== "images") {
    setActivityStatus(messages.status.imagePageScrollUnavailable);
    setToolbarMode("other");
    return;
  }

  isImagePageAutoScrollRunning = true;
  setToolbarMode("images");
  updateToolbarControls();
  setActivityStatus(messages.status.imagePageScrollStarting);

  const maxSteps = 240;
  const delayMs = 900;
  const stableScrollLimit = 6;
  const stableImportLimit = 8;
  let stableScrollCount = 0;
  let stableImportCount = 0;
  let previousImportCount = await getRecentImageGenRecordCount();
  let lastReason: "completed" | "stopped" | "limit" | "unavailable" = "limit";

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (!isImagePageAutoScrollRunning) {
        lastReason = "stopped";
        break;
      }

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrollChatGptImagesPageOnce,
        args: [{ stepRatio: 0.82 }]
      });
      const scrollResult = result?.result as AutoScrollStepResult | undefined;
      if (!scrollResult?.available) {
        lastReason = "unavailable";
        break;
      }

      await delay(delayMs);
      const importCount = await refreshImageImportSummaryAndCount();
      stableScrollCount = scrollResult.moved ? 0 : stableScrollCount + 1;
      stableImportCount = importCount > previousImportCount ? 0 : stableImportCount + 1;
      previousImportCount = importCount;

      setActivityStatus(messages.status.imagePageScrollProgress(importCount));

      if (stableScrollCount >= stableScrollLimit || stableImportCount >= stableImportLimit) {
        lastReason = "completed";
        break;
      }
    }

    if (lastReason === "limit") {
      setActivityStatus(messages.status.imagePageScrollTimedOut(previousImportCount));
    } else if (lastReason === "stopped") {
      setActivityStatus(messages.status.imagePageScrollStopped(previousImportCount));
    } else if (lastReason === "unavailable") {
      setActivityStatus(messages.status.imagePageScrollUnavailable);
    } else {
      setActivityStatus(messages.status.imagePageScrollCompleted(previousImportCount));
    }
  } catch (error) {
    setActivityStatus(messages.status.imagePageScrollFailed);
    console.warn("Failed to auto-scroll ChatGPT Images page", error);
  } finally {
    isImagePageAutoScrollRunning = false;
    updateToolbarControls();
    await refreshImageImportSummary();
  }
}

async function refreshImageImportSummary(): Promise<void> {
  await refreshImageImportSummaryAndCount();
}

async function refreshImageImportSummaryAndCount(): Promise<number> {
  const records = await loadImageUrlRecords().catch((error: unknown) => {
    console.warn("Failed to load image URL records", error);
    return new Map<string, ImageUrlRecord>();
  });
  const stats = getImageUrlRecordStats(records.values());
  setImageImportSummary(stats);
  return stats.recentImageGenRecordCount;
}

async function getRecentImageGenRecordCount(): Promise<number> {
  const records = await loadImageUrlRecords().catch(() => new Map<string, ImageUrlRecord>());
  return getImageUrlRecordStats(records.values()).recentImageGenRecordCount;
}

type PageScrollStepOptions = {
  stepRatio: number;
};

function scrollChatGptImagesPageOnce(options: PageScrollStepOptions): AutoScrollStepResult {
  const scrollTarget = findBestScrollTarget();
  if (!scrollTarget) {
    return { available: false, moved: false, scrollTop: 0, scrollHeight: 0 };
  }

  const beforeTop = getScrollTop(scrollTarget);
  const beforeHeight = getScrollHeight(scrollTarget);
  const distance = Math.max(480, Math.floor(getClientHeight(scrollTarget) * options.stepRatio));
  scrollByDistance(scrollTarget, distance);

  const afterTop = getScrollTop(scrollTarget);
  const afterHeight = getScrollHeight(scrollTarget);
  return {
    available: true,
    moved: Math.abs(afterTop - beforeTop) > 4 || afterHeight > beforeHeight + 4,
    scrollTop: afterTop,
    scrollHeight: afterHeight
  };

  function findBestScrollTarget(): Element | undefined {
    const candidates = [document.scrollingElement, document.documentElement, document.body, ...document.querySelectorAll("*")].filter(
      (element): element is Element => Boolean(element)
    );

    let best: Element | undefined;
    let bestScore = 0;
    for (const element of candidates) {
      const scrollHeight = getScrollHeight(element);
      const clientHeight = getClientHeight(element);
      const overflow = scrollHeight - clientHeight;
      if (overflow < 300) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const score = overflow + (visibleWidth * visibleHeight) / 1000;
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return best;
  }

  function getScrollTop(element: Element): number {
    return element === document.scrollingElement || element === document.documentElement || element === document.body
      ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      : element.scrollTop;
  }

  function getScrollHeight(element: Element): number {
    return element === document.scrollingElement || element === document.documentElement || element === document.body
      ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      : element.scrollHeight;
  }

  function getClientHeight(element: Element): number {
    return element === document.scrollingElement || element === document.documentElement || element === document.body
      ? window.innerHeight
      : element.clientHeight;
  }

  function scrollByDistance(element: Element, distance: number): void {
    if (element === document.scrollingElement || element === document.documentElement || element === document.body) {
      window.scrollBy({ top: distance, behavior: "auto" });
      return;
    }
    element.scrollBy({ top: distance, behavior: "auto" });
  }
}

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleString(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTimestampForFilename(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

moreActionsMenu.addEventListener("toggle", positionMoreActionsMenu);
window.addEventListener("resize", positionMoreActionsMenu);

imagePageScrollButton.addEventListener("click", () => {
  void toggleImagePageAutoScroll();
});

function handleImportedImagesDownloadClick(): void {
  moreActionsMenu.open = false;
  void downloadImportedImages().catch((error: unknown) => {
    setActivityStatus(messages.status.importedImagesSaveFailed);
    console.warn("Failed to download imported images", error);
  });
}

saveImportedImagesButton.addEventListener("click", handleImportedImagesDownloadClick);
saveImportedImagesMenuButton.addEventListener("click", handleImportedImagesDownloadClick);
cancelFolderSaveButton.addEventListener("click", () => {
  cancelFolderSaveButton.disabled = true;
  folderSaveAbortController?.abort();
  setActivityStatus(messages.status.folderSaveCanceling);
});

refreshButton.addEventListener("click", () => {
  void loadCurrentConversation({
    pageImageScanAttempts: AUTO_PAGE_IMAGE_SCAN_ATTEMPTS,
    pageImageScanDelayMs: AUTO_PAGE_IMAGE_SCAN_DELAY_MS
  });
});
showAttachmentsToggle.addEventListener("change", () => {
  showUserAttachments = showAttachmentsToggle.checked;
  renderCurrentItems();
  updateChatDataSummaryForVisibleItems();
  const hiddenCount = countHiddenUserAttachments(currentItems);
  setActivityStatus(showUserAttachments ? messages.status.attachmentsShown : messages.status.attachmentsHidden(hiddenCount));
});
selectionToggleButton.addEventListener("click", toggleSelectAllDownloadableItems);
downloadSelectedButton.addEventListener("click", () => {
  void downloadSelectedImages().catch((error: unknown) => {
    setActivityStatus(messages.status.selectedImageSaveFailed);
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
  viewerImageStatus.textContent = messages.viewer.imageUnavailable;
  viewerCopyImageButton.disabled = true;
});
viewerPrevButton.addEventListener("click", () => moveViewer(-1));
viewerNextButton.addEventListener("click", () => moveViewer(1));
viewerPrevEdgeButton.addEventListener("click", () => moveViewer(-1));
viewerNextEdgeButton.addEventListener("click", () => moveViewer(1));
viewerDownloadButton.addEventListener("click", () => {
  void downloadCurrentViewerImage().catch((error: unknown) => {
    setActivityStatus(messages.status.imageSaveFailed);
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
    setActivityStatus(messages.status.dictionaryExportFailed);
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : messages.errors.unknown);
  });
});
importDictionaryButton.addEventListener("click", () => {
  moreActionsMenu.open = false;
  dictionaryFileInput.click();
});
clearDictionaryButton.addEventListener("click", () => {
  moreActionsMenu.open = false;
  void clearDictionary().catch((error: unknown) => {
    setActivityStatus(messages.status.dictionaryClearFailed);
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : messages.errors.unknown);
  });
});
dictionaryFileInput.addEventListener("change", () => {
  const file = dictionaryFileInput.files?.[0];
  dictionaryFileInput.value = "";
  if (!file) {
    return;
  }

  void importDictionaryFromFile(file).catch((error: unknown) => {
    setActivityStatus(messages.status.dictionaryImportFailed);
    renderError(error instanceof Error ? localizeErrorMessage(error.message) : messages.errors.unknown);
  });
});

wireAutoRefreshEvents();
void loadCurrentConversation({
  pageImageScanAttempts: AUTO_PAGE_IMAGE_SCAN_ATTEMPTS,
  pageImageScanDelayMs: AUTO_PAGE_IMAGE_SCAN_DELAY_MS
});
