import type { MetadataRoute } from "next";

const SITE = "https://www.stewardshipbrief.com";

/** Paths that must not be crawled (tools, APIs, account flows). */
const DISALLOW_TOOLS = [
  "/feed",
  "/dashboard",
  "/api/",
  "/stewardshipbrief/settings",
  "/brief/unsubscribe",
];

/**
 * AI *training* / generative-use crawlers (opt-out).
 * Does not block Googlebot — Search and AI Overviews stay available.
 * Search-oriented bots (e.g. OAI-SearchBot) follow the default rules below.
 */
const AI_TRAINING_AGENTS = [
  "GPTBot",
  "Google-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_TRAINING_AGENTS.map((userAgent) => ({
        userAgent,
        disallow: ["/"],
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_TOOLS,
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
