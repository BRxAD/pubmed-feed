import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the JCR CSV is bundled into Vercel serverless functions
  // so lib/jif.ts can read it via fs.readFileSync at runtime.
  outputFileTracingIncludes: {
    "/feed": ["./data/jcr.csv"],
    "/feed/ai-stewardship": ["./data/jcr.csv"],
    "/api/**": ["./data/jcr.csv"],
  },
};

export default nextConfig;
