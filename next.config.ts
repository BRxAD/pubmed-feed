import type { NextConfig } from "next";

const dataFiles = ["./data/jcr.csv", "./data/scimago_q1.json"];

const nextConfig: NextConfig = {
  // Bundle journal lookup files into Vercel serverless functions.
  outputFileTracingIncludes: {
    "/": dataFiles,
    "/stewardshipbrief": dataFiles,
    "/feed": dataFiles,
    "/feed/ai-stewardship": dataFiles,
    "/api/**": dataFiles,
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
