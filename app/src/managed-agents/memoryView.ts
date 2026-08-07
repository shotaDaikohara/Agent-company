import { client } from "./client.js";

export interface MemoryEntryView {
  path: string;
  content: string | null;
  contentSizeBytes: number | null;
}

/**
 * ユーザースコープのMemory Storeの中身を一覧する（読み取り専用）。
 * UC-18「記憶内容の閲覧」対応。訂正（更新/削除）はPhase 2以降で追加する。
 */
export async function listUserMemoryEntries(memoryStoreId: string): Promise<MemoryEntryView[]> {
  const entries: MemoryEntryView[] = [];
  for await (const item of client.beta.memoryStores.memories.list(memoryStoreId, {
    path_prefix: "/",
    view: "full",
  })) {
    if (item.type !== "memory") continue; // memory_prefix（ディレクトリ相当）は除外
    entries.push({
      path: item.path,
      content: "content" in item ? (item.content ?? null) : null,
      contentSizeBytes: "content_size_bytes" in item ? (item.content_size_bytes ?? null) : null,
    });
  }
  return entries;
}
