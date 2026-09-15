import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/courses/*/lessons/*/edit": ["./content/*.md", "./docs/markdown.md"],
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
