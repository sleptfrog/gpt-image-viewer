import { describe, expect, it } from "vitest";
import {
  createChatFolderName,
  createFailureReportJson,
  createFolderSaveFailure,
  createFolderSaveFailureReport,
  createFolderSaveRootName,
  getUniqueFileHandle,
  sanitizeFileSystemName,
  writeFile,
  type DirectoryHandleLike,
  type FileHandleLike,
  type WritableFileLike
} from "../../src/sidepanel/folder-save";

class FakeWritable implements WritableFileLike {
  constructor(private readonly commit: (value: Blob | BufferSource | string) => void) {}

  async write(data: Blob | BufferSource | string): Promise<void> {
    this.commit(data);
  }

  async close(): Promise<void> {
    // no-op
  }
}

class FakeFileHandle implements FileHandleLike {
  value: Blob | BufferSource | string | undefined;

  async createWritable(): Promise<WritableFileLike> {
    return new FakeWritable((value) => {
      this.value = value;
    });
  }
}

class FakeDirectoryHandle implements DirectoryHandleLike {
  readonly files = new Map<string, FakeFileHandle>();
  readonly directories = new Map<string, FakeDirectoryHandle>();

  constructor(existingFiles: string[] = []) {
    for (const file of existingFiles) {
      this.files.set(file, new FakeFileHandle());
    }
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<DirectoryHandleLike> {
    const existing = this.directories.get(name);
    if (existing) {
      return existing;
    }
    if (!options.create) {
      throw new DOMException("Not found", "NotFoundError");
    }

    const created = new FakeDirectoryHandle();
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FileHandleLike> {
    const existing = this.files.get(name);
    if (existing) {
      return existing;
    }
    if (!options.create) {
      throw new DOMException("Not found", "NotFoundError");
    }

    const created = new FakeFileHandle();
    this.files.set(name, created);
    return created;
  }
}

describe("folder save helpers", () => {
  it("creates safe root and chat folder names", () => {
    expect(createFolderSaveRootName("2026-05-24T01:02:03.000Z")).toBe("GPT Image Viewer 20260524-010203");
    expect(createFolderSaveRootName("2026-05-24T01:02:03.000Z", "jst")).toBe("GPT Image Viewer 20260524-100203");
    expect(createFolderSaveRootName("2026-05-24T18:30:00.000Z", "jst")).toBe("GPT Image Viewer 20260525-033000");
    expect(sanitizeFileSystemName('bad:/name*?')).toBe("bad--name--");

    const titles = new Map([["6a0ee4a0-ea7c-83a5-a0e4-6b60a7b6b89b", "My chat: title"]]);
    expect(createChatFolderName({ conversationId: "6a0ee4a0-ea7c-83a5-a0e4-6b60a7b6b89b" }, titles)).toBe(
      "My chat- title-6a0ee4a0"
    );
    expect(createChatFolderName({ conversationId: "conversation-id" }, new Map())).toBe("chat-conversation-id");
    expect(createChatFolderName({}, new Map())).toBe("chat-unknown");
  });

  it("avoids overwriting existing files with numeric suffixes", async () => {
    const directory = new FakeDirectoryHandle(["image.png", "image-2.png"]);

    const result = await getUniqueFileHandle(directory, "image.png");
    await writeFile(result.handle, { path: result.name, data: new Uint8Array([1, 2, 3]) });

    expect(result.name).toBe("image-3.png");
    expect([...directory.files.keys()]).toContain("image-3.png");
  });

  it("creates failure reports without raw data or signed URLs", () => {
    const failure = createFolderSaveFailure(
      {
        source: "chatgpt-web",
        imageId: "file_abc",
        conversationId: "conversation-id",
        messageId: "message-id",
        imageUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_abc&sig=secret",
        capturedAt: "2026-05-24T01:02:03.000Z",
        raw: { secret: true }
      },
      "request failed",
      { folder: "chat-conversation-id", filename: "image.png" }
    );

    const json = createFailureReportJson(createFolderSaveFailureReport([failure], "2026-05-24T01:03:00.000Z"));
    expect(json).toContain("file_abc");
    expect(json).toContain("request failed");
    expect(json).not.toContain("sig=secret");
    expect(json).not.toContain("raw");
  });
});
