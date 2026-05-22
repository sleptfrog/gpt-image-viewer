import { describe, expect, it } from "vitest";

import { detectLocaleFromLanguage, detectLocaleFromLanguages, messageCatalogs } from "../../src/sidepanel/messages";

describe("Side Panel messages", () => {
  it("detects locale from the first available Chrome or browser language", () => {
    expect(detectLocaleFromLanguage("ja")).toBe("ja");
    expect(detectLocaleFromLanguage("ja-JP")).toBe("ja");
    expect(detectLocaleFromLanguage("en-US")).toBe("en");
    expect(detectLocaleFromLanguage("unknown")).toBe("en");
    expect(detectLocaleFromLanguage(undefined)).toBe("en");
    expect(detectLocaleFromLanguages(["en-US", "ja-JP"])).toBe("en");
    expect(detectLocaleFromLanguages([undefined, "ja-JP", "en-US"])).toBe("ja");
  });

  it("keeps representative Japanese and English dynamic messages available", () => {
    expect(messageCatalogs.ja.ui.selectionSummary(2, 5)).toBe("2 / 5件選択");
    expect(messageCatalogs.en.ui.selectionSummary(2, 5)).toBe("2 / 5 selected");
    expect(messageCatalogs.ja.labels.fieldLine(messageCatalogs.ja.labels.userInput, "猫を描いて")).toBe(
      "ユーザー入力: 猫を描いて"
    );
    expect(messageCatalogs.en.labels.fieldLine(messageCatalogs.en.labels.userInput, "Draw a cat")).toBe(
      "User input: Draw a cat"
    );
  });

  it("formats loaded status in both locales", () => {
    const input = {
      statusPrefix: messageCatalogs.ja.status.loadedPrefix,
      itemCount: 3,
      pageUrlCount: 1,
      matchedUrlRecordCount: 2,
      storedUrlRecordCount: 4,
      missingUrlCount: 1,
      hiddenAttachmentCount: 1,
      showUserAttachments: false
    };

    expect(messageCatalogs.ja.status.loaded(input)).toBe(
      "取得済みデータを読み込み: 3件, ページ上のURL 1件, 辞書URL 2/4件, 画像未取得 1件, 添付画像を非表示 1件"
    );

    expect(
      messageCatalogs.en.status.loaded({
        ...input,
        statusPrefix: messageCatalogs.en.status.loadedPrefix
      })
    ).toBe("Loaded captured data: 3 items, page URLs 1 item, dictionary URLs 2/4, missing images 1 item, attachments hidden 1 item");
  });
});
