export const messages = {
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
    loaded: (input: {
      statusPrefix: string;
      itemCount: number;
      pageUrlCount: number;
      matchedUrlRecordCount: number;
      storedUrlRecordCount: number;
      missingUrlCount: number;
      hiddenAttachmentCount: number;
      showUserAttachments: boolean;
    }) => {
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
    selected: (count: number) => `${count}件を選択中`,
    selectionCleared: "選択を解除しました",
    noSelectableImages: "選択できる取得済み画像がありません",
    allSelectionCleared: "全選択を解除しました",
    allSelected: (count: number) => `${count}件を全選択しました`,
    attachmentsShown: "添付画像を表示しています",
    attachmentsHidden: (count: number) => `添付画像を非表示にしました（${count}件）`,
    viewerNoImageUrl: "ビューアで表示できる画像URLがありません",
    imageSavedEmbedded: (path: string) => `${path} を保存しました（メタデータ埋め込み済み）`,
    imageSavedWithJson: (path: string) => `${path} を保存しました（JSON同梱）`,
    imageSaving: "画像を保存中",
    imageUrlMissing: "この画像のURLはまだ取得できていません",
    selectedImageSaveFailed: "選択画像の保存に失敗しました",
    imageSaveFailed: "画像の保存に失敗しました",
    imageCopied: "画像をクリップボードにコピーしました",
    imageCopyFailed: "画像のコピーに失敗しました",
    textCopied: (label: string) => `${label}をコピーしました`,
    textCopyFailed: (label: string) => `${label}のコピーに失敗しました`,
    noSelectedImagesToSave: "保存できる選択画像がありません",
    zipPreparing: (current: number, total: number) => `ZIPを準備中 ${current}/${total}`,
    noZipFiles: "ZIPに追加できる画像がありませんでした",
    zipSaved: (downloaded: number, total: number) => `${downloaded}/${total}件をZIPで保存しました`,
    zipFailed: (count: number) => `失敗 ${count}件`,
    zipSkippedMissing: (count: number) => `画像未取得をスキップ ${count}件`,
    metadataExported: (count: number) => `メタデータJSON ${count}件を書き出しました`,
    dictionaryExported: (count: number) => `辞書レコード ${count}件を書き出しました`,
    dictionaryImported: (count: number) => `辞書レコード ${count}件を読み込みました`,
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
    hiddenAttachments: (count: number) =>
      `添付画像 ${count}件は非表示です。「添付画像」をオンにすると表示できます。`
  },
  notice: {
    missingImages: (count: number) =>
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
    skippedMissingImages: (count: number) => ` 画像未取得の ${count}件はスキップされます。`,
    zipMessage: (count: number, skippedText: string) =>
      `選択した画像 ${count}件を1つのZIPファイルとして保存します。${skippedText}`,
    zipFallback: (count: number) => `選択した画像 ${count}件をZIPで保存しますか？`,
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
    canvasContextUnavailable: "Canvas 2Dコンテキストを取得できません",
    canvasConversionFailed: "Canvas変換に失敗しました",
    metadataEmbeddingFailed: "メタデータ埋め込みに失敗しました",
    metadataEmbeddingUnavailable: "メタデータ埋め込みを利用できませんでした",
    imageRequestFailed: (status: number) => `画像リクエストに失敗しました: ${status}`
  },
  labels: {
    caption: "キャプション",
    prompt: "生成プロンプト",
    userInput: "ユーザー入力",
    jsonIncluded: "JSON同梱"
  }
} as const;
