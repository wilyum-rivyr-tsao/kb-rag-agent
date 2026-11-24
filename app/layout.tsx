import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kb-rag-agent · 个人知识库问答",
  description: "基于 LanceDB + LangChain 的个人知识库 RAG 问答应用",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
