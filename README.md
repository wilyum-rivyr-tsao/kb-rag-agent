# kb-rag-agent — 个人知识库 RAG 问答

基于 Next.js 15 + LangChain.js + LanceDB 的个人知识库问答应用：把 `docs/*.md` 语料切块、向量化存入本地 LanceDB，提问时做 top-5 相似检索，再由火山方舟大模型流式生成带引用标注 [1][2] 的回答。

## 架构

```mermaid
flowchart LR
    subgraph 离线摄入
        A[docs/*.md 语料] --> B[RecursiveCharacterTextSplitter<br/>chunkSize 500 / overlap 80]
        B --> C[火山方舟 embedding 模型]
        C --> D[(LanceDB<br/>data/lancedb 表 chunks<br/>vector/text/source/chunkIndex)]
    end
    subgraph 在线问答
        U[用户提问] --> Q[问题向量化]
        D --> Q
        Q --> R[top-5 余弦相似检索]
        R --> P[带编号上下文 system prompt]
        P --> M[火山方舟 chat 模型 流式输出]
        M --> S[SSE 流式返回<br/>sources 引用 + 回答增量]
        S --> UI[中文聊天界面<br/>引用来源卡片]
    end
```

要点：

- **零外部服务依赖的向量库**：LanceDB 嵌入式，数据落在 `./data/lancedb`，clone 下来即可本地跑通。
- **可重复摄入**：`npm run ingest` 先 drop 旧表再重建，幂等运行。
- **拒答机制**：检索结果最高相似度低于阈值（0.3）时直接回答「知识库中没有相关信息」，不调用大模型、不硬编。
- **SSE 流式协议**：`/api/chat` 返回 `text/event-stream`，依次下发 `sources`（引用来源数组）、`delta`（回答增量）、`done` 三类事件。

## 技术栈

- Next.js 15（App Router）+ TypeScript + React 19
- LangChain.js：`@langchain/core` / `@langchain/openai`（OpenAI 兼容客户端接火山方舟）/ `@langchain/textsplitters`
- 向量库：`@lancedb/lancedb`（嵌入式）
- 模型服务：火山方舟 OpenAI 兼容端点（chat：`deepseek-v4-1-flash-261017`，embedding：`doubao-embedding-large-text-250515`，均可用 env 覆盖）

## Quickstart

```bash
# 1. 配置环境变量（.env 不提交，参考 .env.example）
cp .env.example .env
# 编辑 .env，填入 ARK_API_KEY

# 2. 安装依赖
npm install

# 3. 摄入语料：切块 → embedding → 写入 LanceDB
npm run ingest

# 4. 启动开发服务
npm run dev
# 打开 http://localhost:3000 提问
```

其他脚本：`npm run build`（生产构建）、`npm run lint`（代码检查）、`npm start`（运行构建产物）。

## 目录结构

```
app/
  page.tsx            # 中文聊天界面（流式渲染 + 引用来源卡片 + 示例问题）
  api/chat/route.ts   # POST /api/chat：检索 + 流式 SSE
lib/
  env.ts              # .env 手动加载与必填环境变量校验
  llm.ts              # 方舟 embedding / chat 客户端封装
  vector-store.ts     # LanceDB 建表 / topK 余弦检索
scripts/
  ingest.ts           # 语料摄入脚本（npm run ingest）
docs/                 # 语料（简历、项目说明）
data/lancedb/         # 向量数据（gitignore，ingest 生成）
```

## API

`POST /api/chat`

```json
{ "message": "他的核心优势是什么", "history": [{ "role": "user", "content": "…" }] }
```

响应为 SSE 流：

```
event: sources
data: [{"source":"resume.md","snippet":"…","similarity":0.62}]

event: delta
data: "根据简历"

event: done
data: [DONE]
```

## 验证记录

- 2026-11-24 `npm install`：通过（356 个包）。
- 2026-11-24 `npm run build`：通过（Next.js 15.5.29 生产构建 + 类型检查 + lint 无告警）。
- 2026-11-24 `npm run lint`：通过（0 问题）。
- 2026-11-24 `npm run dev` + curl 冒烟：`GET /` 返回 200；`POST /api/chat`（问「他的核心优势是什么」）请求正常到达火山方舟并返回错误透传，接线正确。
- **待补**：本次开发时方舟账号处于欠费/未开通状态，`ingest` 调 embedding 返回 `404 InvalidEndpointOrModel.NotFound`，chat 返回 `403 AccountOverdueError`（欠费），因此「真实摄入 + 端到端流式问答」未能完成。账号恢复欠费后依次执行 `npm run ingest`（预期输出切块数与写入向量数）和下方 curl 即可复验：

  ```bash
  npm run ingest
  npm run dev &
  curl -s -N -X POST http://localhost:3000/api/chat \
    -H 'Content-Type: application/json' \
    -d '{"message":"他的核心优势是什么"}'
  # 预期：先收到 sources 事件（含 resume.md 引用与相似度），随后多个 delta 事件流式拼出回答，正文含 [1] 类标注
  ```

## Roadmap

- **MCP server**：把检索能力封装成 MCP 工具，供 Claude Code / Cursor 等 Agent 直接查询本知识库。
- **evals 评测集**：基于 docs 语料构造问答对，自动化评估检索命中率与回答忠实度（faithfulness）。
- 混合检索（向量 + 关键词 BM25）与重排序（rerank）。
- 多知识库隔离：按目录/命名空间分表存储，支持按库检索。
