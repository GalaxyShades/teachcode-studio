import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
const nextConfig = (phase: string): NextConfig => ({
  distDir:
    process.env.NEXT_DIST_DIR ||
    (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
  outputFileTracingIncludes: {
    "/courses/*/lessons/*/edit": ["./content/*.md", "./docs/markdown.md"],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
});
export default nextConfig;
