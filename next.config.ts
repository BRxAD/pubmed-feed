import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CI runs eslint separately; don't block Vercel deploys on lint drift.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ensure the JCR CSV is bundled into Vercel serverless functions
  // so lib/jif.ts can read it via fs.readFileSync at runtime.
  outputFileTracingIncludes: {
    "/feed": ["./data/jcr.csv"],
    "/feed/ai-stewardship": ["./data/jcr.csv"],
    "/api/**": ["./data/jcr.csv"],
  },
};

export default nextConfig;
