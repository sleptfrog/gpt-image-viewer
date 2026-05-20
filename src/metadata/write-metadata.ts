import type { ImageMetadata, MetadataExport } from "./types";

export function stripRawMetadata(item: ImageMetadata): ImageMetadata {
  const { raw: _raw, ...safeItem } = item;
  return safeItem;
}

export function createMetadataExport(items: ImageMetadata[], exportedAt = new Date().toISOString()): MetadataExport {
  return {
    schemaVersion: 1,
    exportedAt,
    items: items.map(stripRawMetadata)
  };
}
