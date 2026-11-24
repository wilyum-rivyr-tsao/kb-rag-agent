import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LanceDB 带原生二进制依赖，标记为服务端外部包，避免被打包器处理
  serverExternalPackages: ["@lancedb/lancedb"],
};

export default nextConfig;
