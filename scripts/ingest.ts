/**
 * 知识库摄入脚本：docs/*.md → 切块 → embedding → LanceDB
 * 运行：npm run ingest
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { loadEnvFromFile } from "../lib/env";
import { getEmbeddings } from "../lib/llm";
import { rebuildTable, type ChunkRecord } from "../lib/vector-store";

// tsx 环境下手动加载 .env（必须最先执行）
loadEnvFromFile();

const DOCS_DIR = path.join(process.cwd(), "docs");
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 80;
const EMBED_BATCH_SIZE = 16;

async function main() {
  // 1. 读取语料
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    throw new Error(`docs/ 目录下没有找到 .md 语料文件`);
  }
  console.log(`📚 发现语料文件：${files.join(", ")}`);

  // 2. 切块
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const chunks: Omit<ChunkRecord, "vector">[] = [];
  for (const file of files) {
    const content = await readFile(path.join(DOCS_DIR, file), "utf-8");
    const pieces = await splitter.splitText(content);
    pieces.forEach((text, i) => {
      chunks.push({ text, source: file, chunkIndex: i });
    });
  }
  console.log(`✂️  共切块 ${chunks.length} 个（chunkSize=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP}）`);

  // 3. 批量调用 embedding（分批，避免单次请求过大）
  const embeddings = getEmbeddings();
  const texts = chunks.map((c) => c.text);
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const result = await embeddings.embedDocuments(batch);
    vectors.push(...result);
    console.log(`🔢 embedding 进度：${Math.min(i + EMBED_BATCH_SIZE, texts.length)}/${texts.length}`);
  }

  // 4. 写入 LanceDB（先 drop 旧表重建，支持重复运行）
  const records: ChunkRecord[] = chunks.map((c, i) => ({
    ...c,
    vector: vectors[i],
  }));
  await rebuildTable(records);

  console.log(`✅ 摄入完成：写入 ${records.length} 条向量到 data/lancedb 表 "${"chunks"}"`);
}

main().catch((err) => {
  console.error("❌ 摄入失败：", err instanceof Error ? err.message : err);
  process.exit(1);
});
