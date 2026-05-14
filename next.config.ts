import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 使用 __dirname（无需 import path）消除多 lockfile workspace root 推断 warning
    root: __dirname,
  },
};

export default nextConfig;
