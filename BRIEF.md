# kb-rag-agent — 个人知识库 RAG 问答（开发任务书）

你要在当前目录从零实现一个可运行的 RAG 应用。这是求职作品集项目，要求**真实可跑、代码质量高**，招聘方会 clone 下来运行。

## 技术栈（固定，不要替换）

- Next.js 15（App Router）+ TypeScript + React 19
- LangChain.js（@langchain/core、@langchain/openai、@langchain/textsplitters）
- 向量库：@lancedb/lancedb（嵌入式，数据目录 ./data/lancedb，**零外部服务依赖**）
- 模型服务：火山方舟 OpenAI 兼容端点
  - baseURL: `https://ark.cn-beijing.volces.com/api/v3`
  - chat 模型：env `ARK_CHAT_MODEL`（默认 deepseek-v4-1-flash-261017）
  - embedding 模型：env `ARK_EMBEDDING_MODEL`（默认 doubao-embedding-large-text-250515）
  - key：env `ARK_API_KEY`（.env 已提供真实 key，**严禁提交进 git**）

## 功能要求

1. **ingest 脚本** `scripts/ingest.ts`（`npm run ingest`）：
   - 读取 `docs/*.md`（语料已放好：resume.md、kids-one-shot.md）
   - RecursiveCharacterTextSplitter 切块（chunkSize 500 / overlap 80）
   - 批量调 embedding，写入 LanceDB 表 `chunks`，字段：vector、text、source（文件名）、chunkIndex
   - 支持重复运行（先 drop 旧表重建）
2. **API** `app/api/chat/route.ts`：POST `{message, history?}`
   - 查询向量化 → top-5 检索 → 组装带编号的上下文 prompt → 流式输出回答
   - 回答中引用来源用 [1][2] 标注；响应同时返回 sources 数组（source 文件名 + 片段 + 相似度）
   - 无相关内容时明确说「知识库中没有相关信息」，禁止硬编
3. **UI** `app/page.tsx`：中文聊天界面
   - 流式渲染回答；每条回答下方展示引用来源卡片（文件名 + 片段）
   - 简洁专业的极客风设计；首屏给 3 个示例问题按钮（如「他的核心优势是什么」「kids-one-shot 是怎么编排多模型的」）
4. **README.md**：项目简介、架构说明（mermaid 图）、技术栈、Quickstart（配 env → ingest → dev）、Roadmap（MCP server、evals 评测集）

## 工程要求

- .gitignore：node_modules、.next、.env、data/
- .env.example 提交，.env 绝不提交
- 环境变量读取用 process.env，缺失时启动报错并给出清晰提示
- UI 文案全中文；关键代码注释中文
- package.json scripts：dev / build / ingest / lint

## 验收（你必须自己跑通再结束）

1. `npm install` 成功
2. `npm run ingest` 真实跑通：输出切块数、写入向量数（用 .env 里的真实 key 调方舟）
3. `npm run build` 通过
4. `npm run dev` 启动后，用 curl 调 /api/chat 问「他的核心优势是什么」，确认返回流式回答且含真实引用来源；把这次 curl 的请求和响应要点写进 README 的「验证记录」小节
5. 最后 `git add -A && git commit -m "feat: kb-rag-agent RAG 问答应用初版"`（.env 不在提交内，commit 前 `git status` 自查）

注意：npm 安装如超时，配代理 http://127.0.0.1:7897。不要动 docs/ 下的语料内容。
