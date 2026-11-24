import { getChatModel, getEmbeddings } from "@/lib/llm";
import { searchSimilar } from "@/lib/vector-store";

// LanceDB 依赖 Node 原生模块，必须跑在 Node 运行时
export const runtime = "nodejs";

/** 判定「相关知识」的余弦相似度阈值，低于则拒答 */
const MIN_SIMILARITY = 0.3;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface SourceItem {
  source: string;
  snippet: string;
  similarity: number;
}

const NO_ANSWER_TEXT =
  "知识库中没有相关信息。请尝试换个问法，或先通过 `npm run ingest` 补充语料。";

/** 组装带编号上下文的 system prompt */
function buildSystemPrompt(contexts: string[]): string {
  const numbered = contexts
    .map((text, i) => `[${i + 1}] ${text}`)
    .join("\n\n");
  return `你是一个基于个人知识库的问答助手。请严格根据下面的上下文回答用户问题，并遵守以下规则：

1. 回答中的事实性内容必须在上下文中能找到依据，引用来源时用 [编号] 标注，例如 [1] 或 [1][2]；
2. 如果上下文不足以回答问题，明确回答「知识库中没有相关信息」，不要编造；
3. 回答使用简体中文，简洁、准确、有条理。

上下文：
${numbered}`;
}

function sseFrame(event: string, data: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export async function POST(req: Request) {
  let body: { message?: string; history?: HistoryMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "message 不能为空" }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  try {
    // 1. 问题向量化 → top-5 检索
    const embeddings = getEmbeddings();
    const queryVector = await embeddings.embedQuery(message);
    const results = await searchSimilar(queryVector, 5);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // 2. 无相关内容：明确拒答，不调用大模型
        if (results.length === 0 || results[0].similarity < MIN_SIMILARITY) {
          const sources: SourceItem[] = [];
          controller.enqueue(sseFrame("sources", JSON.stringify(sources)));
          controller.enqueue(sseFrame("delta", JSON.stringify(NO_ANSWER_TEXT)));
          controller.enqueue(sseFrame("done", "[DONE]"));
          controller.close();
          return;
        }

        const sources: SourceItem[] = results.map((r) => ({
          source: r.source,
          snippet: r.text.slice(0, 120),
          similarity: Number(r.similarity.toFixed(4)),
        }));
        controller.enqueue(sseFrame("sources", JSON.stringify(sources)));

        // 3. 组装带编号上下文的 prompt，流式输出
        const model = getChatModel(true);
        const messages = [
          { role: "system" as const, content: buildSystemPrompt(results.map((r) => r.text)) },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: message },
        ];

        for await (const chunk of await model.stream(messages)) {
          const text = typeof chunk.content === "string" ? chunk.content : "";
          if (text) controller.enqueue(sseFrame("delta", JSON.stringify(text)));
        }
        controller.enqueue(sseFrame("done", "[DONE]"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `问答失败：${detail}` }, { status: 500 });
  }
}
