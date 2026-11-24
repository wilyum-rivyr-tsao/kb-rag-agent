import fs from "node:fs";
import path from "node:path";

/**
 * Next.js 会自动加载 .env，但 tsx 直接跑脚本时不会。
 * 这里手动解析 .env 补齐环境变量（不覆盖已有的）。
 */
export function loadEnvFromFile(): void {
  if (process.env.ARK_API_KEY) return;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key in process.env) continue;
    // 去掉首尾引号
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
}

/** 读取必填环境变量，缺失时抛出带提示的错误 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `缺少环境变量 ${name}。请参照 .env.example 在项目根目录创建 .env 并填入真实配置。`,
    );
  }
  return value;
}

/** 方舟 OpenAI 兼容端点地址 */
export function arkBaseURL(): string {
  return (
    process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3"
  );
}
