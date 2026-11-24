import * as lancedb from "@lancedb/lancedb";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data", "lancedb");
export const TABLE_NAME = "chunks";

export interface ChunkRecord {
  vector: number[];
  text: string;
  source: string;
  chunkIndex: number;
}

export interface SearchResult {
  text: string;
  source: string;
  chunkIndex: number;
  /** 余弦相似度，范围 [0, 1]，越接近 1 越相关 */
  similarity: number;
}

/** 连接本地 LanceDB（嵌入式，零外部服务依赖） */
export async function connectDB(): Promise<lancedb.Connection> {
  return lancedb.connect(DATA_DIR);
}

/** 重建 chunks 表：先 drop 旧表再写入新数据，支持重复运行 */
export async function rebuildTable(records: ChunkRecord[]): Promise<void> {
  const db = await connectDB();
  try {
    await db.dropTable(TABLE_NAME);
  } catch {
    // 首次运行时表不存在，忽略
  }
  await db.createTable(TABLE_NAME, records as unknown as Record<string, unknown>[]);
}

/** 向量相似度检索：余弦距离取 topK */
export async function searchSimilar(
  vector: number[],
  topK = 5,
): Promise<SearchResult[]> {
  const db = await connectDB();
  const table = await db.openTable(TABLE_NAME);
  const rows = await table
    .query()
    .nearestTo(vector)
    .distanceType("cosine")
    .limit(topK)
    .toArray();
  return rows.map((row) => ({
    text: String(row.text),
    source: String(row.source),
    chunkIndex: Number(row.chunkIndex),
    // LanceDB 返回的 _distance 为余弦距离，相似度 = 1 - 距离
    similarity: 1 - Number(row._distance),
  }));
}
