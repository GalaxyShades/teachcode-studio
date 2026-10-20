import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
const nextConfig = (phase: string): NextConfig => ({
  ...(process.env.STUDIO_BASE_PATH
    ? { basePath: process.env.STUDIO_BASE_PATH }
    : {}),
  env: {
    NEXT_PUBLIC_STUDIO_BASE_PATH: process.env.STUDIO_BASE_PATH || "",
  },
  distDir:
    process.env.NEXT_DIST_DIR ||
    (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
  outputFileTracingIncludes: {
    "/courses/*/lessons/*/edit": ["./content/*.md", "./docs/markdown.md"],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  webpack(config: { parallelism?: number }) {
    config.parallelism = 1;
    return config;
  },
});
export default nextConfig;
