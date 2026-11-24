import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { arkBaseURL, requireEnv } from "./env";

/** embedding 模型客户端（火山方舟 OpenAI 兼容端点） */
export function getEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    model: requireEnv("ARK_EMBEDDING_MODEL"),
    apiKey: requireEnv("ARK_API_KEY"),
    configuration: { baseURL: arkBaseURL() },
  });
}

/** chat 模型客户端 */
export function getChatModel(streaming = false): ChatOpenAI {
  return new ChatOpenAI({
    model: requireEnv("ARK_CHAT_MODEL"),
    apiKey: requireEnv("ARK_API_KEY"),
    temperature: 0.3,
    streaming,
    configuration: { baseURL: arkBaseURL() },
  });
}
