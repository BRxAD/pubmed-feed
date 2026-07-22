import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the JCR CSV is bundled into Vercel serverless functions
  // so lib/jif.ts can read it via fs.readFileSync at runtime.
  outputFileTracingIncludes: {
    "/": ["./data/jcr.csv"],
    "/stewardshipbrief": ["./data/jcr.csv"],
    "/feed": ["./data/jcr.csv"],
    "/feed/ai-stewardship": ["./data/jcr.csv"],
    "/api/**": ["./data/jcr.csv"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
