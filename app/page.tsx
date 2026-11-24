"use client";

import { useRef, useState } from "react";

interface SourceItem {
  source: string;
  snippet: string;
  similarity: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  error?: boolean;
}

const EXAMPLE_QUESTIONS = [
  "他的核心优势是什么？",
  "kids-one-shot 是怎么编排多模型的？",
  "他在京东做了哪些工作？",
];

/** 把回答文本里的 [1] 这类引用标注渲染为高亮上标 */
function renderContent(content: string) {
  const parts = content.split(/(\[\d+(?:\]\[\d+)*\])/g);
  return parts.map((part, i) =>
    /^\[\d+\]/.test(part) ? (
      <span key={i} className="cite">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send(question: string) {
    const text = question.trim();
    if (!text || streaming) return;

    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const detail = await res.text();
        throw new Error(`请求失败（${res.status}）：${detail.slice(0, 200)}`);
      }

      // 解析 SSE 流：sources / delta / done 三类事件
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const apply = (event: string, data: string) => {
        if (event === "sources") {
          const sources: SourceItem[] = JSON.parse(data);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") next[next.length - 1] = { ...last, sources };
            return next;
          });
        } else if (event === "delta") {
          const delta: string = JSON.parse(data);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant")
              next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          });
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          let event = "";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (event && data) apply(event, data);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant")
          next[next.length - 1] = { ...last, content: `出错了：${msg}`, error: true };
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const lastAssistant = messages.filter((m) => m.role === "assistant").at(-1);

  return (
    <div className="container">
      <header className="header">
        <h1>
          <span className="prompt">❯</span> kb-rag-agent
        </h1>
        <p>个人知识库 RAG 问答 · LanceDB 本地向量检索 · 火山方舟大模型</p>
      </header>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty">
            <div>向知识库提问，回答将带引用来源标注。</div>
            <div className="examples">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button key={q} className="example-btn" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`message ${m.role}${m.error ? " error" : ""}`}>
              {m.role === "assistant" ? renderContent(m.content) : m.content}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="cursor" />
              )}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="sources">
                  <div className="sources-label">引用来源</div>
                  {m.sources.map((s, j) => (
                    <div key={j} className="source-card">
                      <span className="source-name">[{j + 1}] {s.source}</span>
                      <span className="source-score">
                        相似度 {(s.similarity * 100).toFixed(1)}%
                      </span>
                      <div>{s.snippet}…</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form
        className="input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            streaming
              ? "正在思考中…"
              : lastAssistant?.error
                ? "可重试提问…"
                : "输入问题，回车发送…"
          }
          disabled={streaming}
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
