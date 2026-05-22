export type Locale = "ja" | "en";

export type LoadedStatusInput = {
  statusPrefix: string;
  itemCount: number;
  pageUrlCount: number;
  matchedUrlRecordCount: number;
  storedUrlRecordCount: number;
  missingUrlCount: number;
  hiddenAttachmentCount: number;
  showUserAttachments: boolean;
};

export type MessageCatalog = {
  status: {
    loadingCurrentChat: string;
    outsideChatGpt: string;
    chatGptNonChatPage: string;
    chatGptImagesPage: string;
    chatDataNotCaptured: string;
    noImagesInConversation: string;
    loadFailed: string;
    loadedPrefix: string;
    loaded: (input: LoadedStatusInput) => string;
    selected: (count: number) => string;
    selectionCleared: string;
    noSelectableImages: string;
    allSelectionCleared: string;
    allSelected: (count: number) => string;
    attachmentsShown: string;
    attachmentsHidden: (count: number) => string;
    viewerNoImageUrl: string;
    imageSavedEmbedded: (path: string) => string;
    imageSavedWithJson: (path: string) => string;
    imageSaving: string;
    imageUrlMissing: string;
    selectedImageSaveFailed: string;
    imageSaveFailed: string;
    imageCopied: string;
    imageCopyFailed: string;
    textCopied: (label: string) => string;
    textCopyFailed: (label: string) => string;
    noSelectedImagesToSave: string;
    zipPreparing: (current: number, total: number) => string;
    noZipFiles: string;
    zipSaved: (downloaded: number, total: number) => string;
    zipFailed: (count: number) => string;
    zipSkippedMissing: (count: number) => string;
    metadataExported: (count: number) => string;
    dictionaryExported: (count: number) => string;
    dictionaryImported: (count: number) => string;
    dictionaryCleared: string;
    dictionaryReloading: string;
    dictionaryExportFailed: string;
    dictionaryClearFailed: string;
    dictionaryImportFailed: string;
  };
  empty: {
    loading: string;
    outsideChatGpt: string;
    chatGptNonChatPage: string;
    chatGptImagesPage: string;
    chatDataNotCaptured: string;
    noImagesInConversation: string;
    noMetadata: string;
    hiddenAttachments: (count: number) => string;
  };
  notice: {
    missingImages: (count: number) => string;
  };
  progress: {
    preparingImages: string;
    creatingZip: string;
    noZipFiles: string;
    downloadStarted: string;
  };
  confirm: {
    selectedImages: string;
    skippedMissingImages: (count: number) => string;
    zipMessage: (count: number, skippedText: string) => string;
    zipFallback: (count: number) => string;
    clearDictionaryFallback: string;
  };
  viewer: {
    imageUnavailable: string;
    userInputMissing: string;
    captionMissing: string;
    promptMissing: string;
  };
  errors: {
    unknown: string;
    sidePanelInitFailed: string;
    activeTabMissing: string;
    canvasContextUnavailable: string;
    canvasConversionFailed: string;
    metadataEmbeddingFailed: string;
    metadataEmbeddingUnavailable: string;
    imageRequestFailed: (status: number) => string;
  };
  labels: {
    caption: string;
    prompt: string;
    userInput: string;
    jsonIncluded: string;
    image: string;
    imageMissing: string;
    generatedImageAlt: string;
    userAttachment: string;
    fieldLine: (label: string, value: string) => string;
    openViewer: (identity: string) => string;
  };
  ui: {
    appTitle: string;
    itemUnit: string;
    operations: string;
    globalActions: string;
    moreActions: string;
    viewSettings: string;
    selectionActions: string;
    contentList: string;
    chat: string;
    preparing: string;
    selectImage: string;
    buttons: {
      refresh: string;
      exportJson: string;
      exportDictionary: string;
      importDictionary: string;
      clearDictionary: string;
      selectAll: string;
      clearSelection: string;
      saveSelectedImages: string;
      save: string;
      cancel: string;
      clearAll: string;
      saveZip: string;
      copy: string;
      copyImage: string;
    };
    attachments: string;
    selectionSummary: (selected: number, total: number) => string;
    clearDictionaryTitle: string;
    clearDictionaryBody: string;
    downloadZipTitle: string;
    downloadZipBody: string;
    viewerTitle: string;
    viewerClose: string;
    viewerPreview: string;
    viewerDetails: string;
    previousImage: string;
    nextImage: string;
    copyUserInput: string;
    copyCaption: string;
    copyPrompt: string;
  };
};

const jaMessages: MessageCatalog = {
  status: {
    loadingCurrentChat: "現在のチャットを読み込み中",
    outsideChatGpt: "ChatGPTのチャットページを開くと画像一覧を表示できます",
    chatGptNonChatPage: "このページでは画像一覧を表示しません。ChatGPTのチャットページを開いてください",
    chatGptImagesPage: "画像ページで読み込まれた画像URLは辞書に取り込まれます。画像一覧はチャットページで表示します",
    chatDataNotCaptured:
      "このチャットのデータはまだ取得されていません。ChatGPTタブを再読み込みしてからサイドパネルを更新してください",
    noImagesInConversation: "このチャットに保存対象の画像は見つかりませんでした",
    loadFailed: "チャットの読み込みに失敗しました",
    loadedPrefix: "取得済みデータを読み込み",
    loaded: (input) => {
      const parts = [
        `${input.statusPrefix}: ${input.itemCount}件`,
        `ページ上のURL ${input.pageUrlCount}件`,
        `辞書URL ${input.matchedUrlRecordCount}/${input.storedUrlRecordCount}件`
      ];

      if (input.missingUrlCount > 0) {
        parts.push(`画像未取得 ${input.missingUrlCount}件`);
      }

      if (!input.showUserAttachments && input.hiddenAttachmentCount > 0) {
        parts.push(`添付画像を非表示 ${input.hiddenAttachmentCount}件`);
      }

      return parts.join(", ");
    },
    selected: (count) => `${count}件を選択中`,
    selectionCleared: "選択を解除しました",
    noSelectableImages: "選択できる取得済み画像がありません",
    allSelectionCleared: "全選択を解除しました",
    allSelected: (count) => `${count}件を全選択しました`,
    attachmentsShown: "添付画像を表示しています",
    attachmentsHidden: (count) => `添付画像を非表示にしました（${count}件）`,
    viewerNoImageUrl: "ビューアで表示できる画像URLがありません",
    imageSavedEmbedded: (path) => `${path} を保存しました（メタデータ埋め込み済み）`,
    imageSavedWithJson: (path) => `${path} を保存しました（JSON同梱）`,
    imageSaving: "画像を保存中",
    imageUrlMissing: "この画像のURLはまだ取得できていません",
    selectedImageSaveFailed: "選択画像の保存に失敗しました",
    imageSaveFailed: "画像の保存に失敗しました",
    imageCopied: "画像をクリップボードにコピーしました",
    imageCopyFailed: "画像のコピーに失敗しました",
    textCopied: (label) => `${label}をコピーしました`,
    textCopyFailed: (label) => `${label}のコピーに失敗しました`,
    noSelectedImagesToSave: "保存できる選択画像がありません",
    zipPreparing: (current, total) => `ZIPを準備中 ${current}/${total}`,
    noZipFiles: "ZIPに追加できる画像がありませんでした",
    zipSaved: (downloaded, total) => `${downloaded}/${total}件をZIPで保存しました`,
    zipFailed: (count) => `失敗 ${count}件`,
    zipSkippedMissing: (count) => `画像未取得をスキップ ${count}件`,
    metadataExported: (count) => `メタデータJSON ${count}件を書き出しました`,
    dictionaryExported: (count) => `辞書レコード ${count}件を書き出しました`,
    dictionaryImported: (count) => `辞書レコード ${count}件を読み込みました`,
    dictionaryCleared: "辞書を全削除しました",
    dictionaryReloading: "辞書なしで再読み込み中",
    dictionaryExportFailed: "辞書の書き出しに失敗しました",
    dictionaryClearFailed: "辞書の全削除に失敗しました",
    dictionaryImportFailed: "辞書の読み込みに失敗しました"
  },
  empty: {
    loading: "読み込み中",
    outsideChatGpt: "ChatGPTのチャットページを開くと画像一覧を表示できます",
    chatGptNonChatPage: "このページでは画像一覧を表示しません。ChatGPTのチャットページを開いてください",
    chatGptImagesPage: "画像ページで読み込まれた画像URLは辞書に取り込まれます。画像一覧はチャットページで表示します",
    chatDataNotCaptured:
      "このチャットのデータはまだ取得されていません。ChatGPTタブを再読み込みしてからサイドパネルを更新してください",
    noImagesInConversation: "このチャットに保存対象の画像は見つかりませんでした",
    noMetadata: "画像メタデータはまだ見つかっていません",
    hiddenAttachments: (count) => `添付画像 ${count}件は非表示です。「添付画像」をオンにすると表示できます。`
  },
  notice: {
    missingImages: (count) =>
      `画像未取得の項目が${count}件あります。ChatGPTの「画像」ページを開き、対象画像が表示されるまでスクロールすると取り込めます。`
  },
  progress: {
    preparingImages: "画像を準備中",
    creatingZip: "ZIPを作成中",
    noZipFiles: "ZIPに追加できる画像がありません",
    downloadStarted: "保存を開始しました"
  },
  confirm: {
    selectedImages: "選択した画像",
    skippedMissingImages: (count) => ` 画像未取得の ${count}件はスキップされます。`,
    zipMessage: (count, skippedText) => `選択した画像 ${count}件を1つのZIPファイルとして保存します。${skippedText}`,
    zipFallback: (count) => `選択した画像 ${count}件をZIPで保存しますか？`,
    clearDictionaryFallback: "このブラウザセッションの画像URL辞書を全削除しますか？"
  },
  viewer: {
    imageUnavailable: "画像を表示できません",
    userInputMissing: "ユーザー入力は取得されていません",
    captionMissing: "キャプションは取得されていません",
    promptMissing: "生成プロンプトは取得されていません"
  },
  errors: {
    unknown: "不明なエラー",
    sidePanelInitFailed: "サイドパネルの初期化に失敗しました。拡張機能を再読み込みしてください。",
    activeTabMissing: "アクティブなタブが見つかりません",
    canvasContextUnavailable: "Canvas 2Dコンテキストを取得できません",
    canvasConversionFailed: "Canvas変換に失敗しました",
    metadataEmbeddingFailed: "メタデータ埋め込みに失敗しました",
    metadataEmbeddingUnavailable: "メタデータ埋め込みを利用できませんでした",
    imageRequestFailed: (status) => `画像リクエストに失敗しました: ${status}`
  },
  labels: {
    caption: "キャプション",
    prompt: "生成プロンプト",
    userInput: "ユーザー入力",
    jsonIncluded: "JSON同梱",
    image: "画像",
    imageMissing: "画像未取得",
    generatedImageAlt: "ChatGPT生成画像",
    userAttachment: "添付画像",
    fieldLine: (label, value) => `${label}: ${value}`,
    openViewer: (identity) => `${identity} をビューアで開く`
  },
  ui: {
    appTitle: "GPT Image Viewer",
    itemUnit: "枚",
    operations: "操作",
    globalActions: "全体操作",
    moreActions: "その他の操作",
    viewSettings: "表示設定",
    selectionActions: "選択操作",
    contentList: "画像一覧",
    chat: "チャット",
    preparing: "準備中",
    selectImage: "選択",
    buttons: {
      refresh: "更新",
      exportJson: "メタデータJSONを書き出し",
      exportDictionary: "辞書を書き出し",
      importDictionary: "辞書を読み込み",
      clearDictionary: "辞書を全削除",
      selectAll: "全選択",
      clearSelection: "全選択解除",
      saveSelectedImages: "選択した画像を保存",
      save: "保存",
      cancel: "キャンセル",
      clearAll: "全削除",
      saveZip: "ZIPを保存",
      copy: "コピー",
      copyImage: "画像をコピー"
    },
    attachments: "添付画像",
    selectionSummary: (selected, total) => `${selected} / ${total}件選択`,
    clearDictionaryTitle: "辞書を全削除しますか？",
    clearDictionaryBody:
      "このブラウザセッションに保存された画像URL辞書を削除します。チャットのメタデータは残りますが、辞書にしかURLがない画像は画像未取得の表示になります。",
    downloadZipTitle: "保存しますか？",
    downloadZipBody: "選択した画像をZIPファイルとして保存します。画像未取得の項目はスキップされます。",
    viewerTitle: "画像ビューア",
    viewerClose: "ビューアを閉じる",
    viewerPreview: "画像プレビュー",
    viewerDetails: "画像メタデータ",
    previousImage: "前の画像",
    nextImage: "次の画像",
    copyUserInput: "ユーザー入力をコピー",
    copyCaption: "キャプションをコピー",
    copyPrompt: "生成プロンプトをコピー"
  }
};

const enMessages: MessageCatalog = {
  status: {
    loadingCurrentChat: "Loading current chat",
    outsideChatGpt: "Open a ChatGPT chat page to view images",
    chatGptNonChatPage: "This page does not show an image list. Open a ChatGPT chat page.",
    chatGptImagesPage: "Image URLs loaded on the Images page are added to the dictionary. Open a chat page to view the list.",
    chatDataNotCaptured: "This chat has not been captured yet. Reload the ChatGPT tab, then refresh the side panel.",
    noImagesInConversation: "No savable images were found in this chat.",
    loadFailed: "Failed to load the chat",
    loadedPrefix: "Loaded captured data",
    loaded: (input) => {
      const parts = [
        `${input.statusPrefix}: ${formatCount(input.itemCount, "item")}`,
        `page URLs ${formatCount(input.pageUrlCount, "item")}`,
        `dictionary URLs ${input.matchedUrlRecordCount}/${input.storedUrlRecordCount}`
      ];

      if (input.missingUrlCount > 0) {
        parts.push(`missing images ${formatCount(input.missingUrlCount, "item")}`);
      }

      if (!input.showUserAttachments && input.hiddenAttachmentCount > 0) {
        parts.push(`attachments hidden ${formatCount(input.hiddenAttachmentCount, "item")}`);
      }

      return parts.join(", ");
    },
    selected: (count) => `${formatCount(count, "item")} selected`,
    selectionCleared: "Selection cleared",
    noSelectableImages: "No loaded images can be selected",
    allSelectionCleared: "Selection cleared",
    allSelected: (count) => `Selected ${formatCount(count, "item")}`,
    attachmentsShown: "Showing attachment images",
    attachmentsHidden: (count) => `Hidden attachment images (${formatCount(count, "item")})`,
    viewerNoImageUrl: "No image URL is available for the viewer",
    imageSavedEmbedded: (path) => `Saved ${path} with embedded metadata`,
    imageSavedWithJson: (path) => `Saved ${path} with sidecar JSON`,
    imageSaving: "Saving image",
    imageUrlMissing: "This image URL has not been captured yet",
    selectedImageSaveFailed: "Failed to save selected images",
    imageSaveFailed: "Failed to save image",
    imageCopied: "Copied image to clipboard",
    imageCopyFailed: "Failed to copy image",
    textCopied: (label) => `Copied ${label}`,
    textCopyFailed: (label) => `Failed to copy ${label}`,
    noSelectedImagesToSave: "No selected images can be saved",
    zipPreparing: (current, total) => `Preparing ZIP ${current}/${total}`,
    noZipFiles: "No images could be added to the ZIP",
    zipSaved: (downloaded, total) => `Saved ${downloaded}/${total} images as a ZIP`,
    zipFailed: (count) => `failed ${formatCount(count, "item")}`,
    zipSkippedMissing: (count) => `skipped missing images ${formatCount(count, "item")}`,
    metadataExported: (count) => `Exported metadata JSON for ${formatCount(count, "item")}`,
    dictionaryExported: (count) => `Exported ${formatCount(count, "dictionary record")}`,
    dictionaryImported: (count) => `Imported ${formatCount(count, "dictionary record")}`,
    dictionaryCleared: "Cleared the dictionary",
    dictionaryReloading: "Reloading without dictionary URLs",
    dictionaryExportFailed: "Failed to export the dictionary",
    dictionaryClearFailed: "Failed to clear the dictionary",
    dictionaryImportFailed: "Failed to import the dictionary"
  },
  empty: {
    loading: "Loading",
    outsideChatGpt: "Open a ChatGPT chat page to view images",
    chatGptNonChatPage: "This page does not show an image list. Open a ChatGPT chat page.",
    chatGptImagesPage: "Image URLs loaded on the Images page are added to the dictionary. Open a chat page to view the list.",
    chatDataNotCaptured: "This chat has not been captured yet. Reload the ChatGPT tab, then refresh the side panel.",
    noImagesInConversation: "No savable images were found in this chat.",
    noMetadata: "No image metadata has been found yet",
    hiddenAttachments: (count) => `${formatCount(count, "attachment image")} hidden. Turn on Attachments to show them.`
  },
  notice: {
    missingImages: (count) =>
      `${formatCount(count, "image")} not loaded yet. Open ChatGPT's Images page and scroll until the target images are visible to import them.`
  },
  progress: {
    preparingImages: "Preparing images",
    creatingZip: "Creating ZIP",
    noZipFiles: "No images can be added to the ZIP",
    downloadStarted: "Save started"
  },
  confirm: {
    selectedImages: "Selected images",
    skippedMissingImages: (count) => ` ${formatCount(count, "missing image")} will be skipped.`,
    zipMessage: (count, skippedText) => `Save ${formatCount(count, "selected image")} as one ZIP file.${skippedText}`,
    zipFallback: (count) => `Save ${formatCount(count, "selected image")} as a ZIP file?`,
    clearDictionaryFallback: "Clear the image URL dictionary for this browser session?"
  },
  viewer: {
    imageUnavailable: "Image unavailable",
    userInputMissing: "User input was not captured",
    captionMissing: "Caption was not captured",
    promptMissing: "Generation prompt was not captured"
  },
  errors: {
    unknown: "Unknown error",
    sidePanelInitFailed: "Failed to initialize the side panel. Reload the extension.",
    activeTabMissing: "No active tab was found",
    canvasContextUnavailable: "Could not get a Canvas 2D context",
    canvasConversionFailed: "Canvas conversion failed",
    metadataEmbeddingFailed: "Metadata embedding failed",
    metadataEmbeddingUnavailable: "Metadata embedding was unavailable",
    imageRequestFailed: (status) => `Image request failed: ${status}`
  },
  labels: {
    caption: "Caption",
    prompt: "Generation prompt",
    userInput: "User input",
    jsonIncluded: "JSON included",
    image: "Image",
    imageMissing: "Image not loaded",
    generatedImageAlt: "ChatGPT generated image",
    userAttachment: "Attachment image",
    fieldLine: (label, value) => `${label}: ${value}`,
    openViewer: (identity) => `Open ${identity} in viewer`
  },
  ui: {
    appTitle: "GPT Image Viewer",
    itemUnit: "items",
    operations: "Actions",
    globalActions: "Global actions",
    moreActions: "More actions",
    viewSettings: "View settings",
    selectionActions: "Selection actions",
    contentList: "Image list",
    chat: "Chat",
    preparing: "Preparing",
    selectImage: "Select",
    buttons: {
      refresh: "Refresh",
      exportJson: "Export metadata JSON",
      exportDictionary: "Export dictionary",
      importDictionary: "Import dictionary",
      clearDictionary: "Clear dictionary",
      selectAll: "Select all",
      clearSelection: "Clear selection",
      saveSelectedImages: "Save selected images",
      save: "Save",
      cancel: "Cancel",
      clearAll: "Clear all",
      saveZip: "Save ZIP",
      copy: "Copy",
      copyImage: "Copy image"
    },
    attachments: "Attachments",
    selectionSummary: (selected, total) => `${selected} / ${total} selected`,
    clearDictionaryTitle: "Clear dictionary?",
    clearDictionaryBody:
      "This clears the image URL dictionary stored for this browser session. Chat metadata remains, but images that only have dictionary URLs will be shown as not loaded.",
    downloadZipTitle: "Save images?",
    downloadZipBody: "Selected images will be saved as a ZIP file. Images that are not loaded will be skipped.",
    viewerTitle: "Image Viewer",
    viewerClose: "Close viewer",
    viewerPreview: "Image preview",
    viewerDetails: "Image metadata",
    previousImage: "Previous image",
    nextImage: "Next image",
    copyUserInput: "Copy user input",
    copyCaption: "Copy caption",
    copyPrompt: "Copy generation prompt"
  }
};

export const messageCatalogs: Record<Locale, MessageCatalog> = {
  ja: jaMessages,
  en: enMessages
};

export function detectLocaleFromLanguage(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function detectLocaleFromLanguages(languages: readonly (string | undefined)[]): Locale {
  const primaryLanguage = languages.find((language) => Boolean(language));
  return detectLocaleFromLanguage(primaryLanguage);
}

export function getMessages(): { locale: Locale; messages: MessageCatalog } {
  const chromeLanguage = getChromeUiLanguage();
  const browserLanguages = getBrowserLanguages();
  const locale = detectLocaleFromLanguages([chromeLanguage, ...browserLanguages]);
  return { locale, messages: messageCatalogs[locale] };
}

function getChromeUiLanguage(): string | undefined {
  if (typeof chrome === "undefined" || typeof chrome.i18n?.getUILanguage !== "function") {
    return undefined;
  }
  return chrome.i18n.getUILanguage();
}

function getBrowserLanguages(): string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
  return [...languages, navigator.language].filter((language): language is string => Boolean(language));
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
