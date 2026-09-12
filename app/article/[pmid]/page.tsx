import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getBriefItemByPmid } from "@/lib/brief/savedBriefItems";
import { assignStoryImages } from "@/lib/brief/storyImages";
import { verifyEmailSaveToken } from "@/lib/digest/emailArticleAction";
import { ensureAuthUserId } from "@/lib/ensureAuthUser";
import { setSavedArticle } from "@/lib/savedArticles";
import BriefSitePage from "@/components/brief/BriefSitePage";
import ArticlePermalinkView from "@/components/brief/ArticlePermalinkView";

type Props = {
  params: Promise<{ pmid: string }>;
  searchParams: Promise<{ save?: string; token?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pmid } = await params;
  const item = await getBriefItemByPmid(pmid);
  if (!item) {
    return {
      title: "Article Not Found | The Stewardship Brief",
    };
  }

  const title = `${item.headline || item.title} | The Stewardship Brief`;
  const description =
    item.bottomLine ||
    item.abstractSnippet ||
    "Antimicrobial stewardship and infectious disease research briefing.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/article/${pmid}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { pmid } = await params;
  const { save, token } = await searchParams;

  const item = await getBriefItemByPmid(pmid);
  if (!item) {
    notFound();
  }

  let autoSaved = false;

  // 1-Click Save from email via cryptographically signed token
  if (save === "1" && token) {
    const verified = verifyEmailSaveToken(token);
    if (verified && verified.pmid === item.pmid) {
      const auth = await ensureAuthUserId({ email: verified.email });
      if ("id" in auth) {
        await setSavedArticle(
          auth.id,
          {
            pmid: item.pmid,
            title: item.headline || item.title,
            pubmedUrl: item.pubmedUrl,
          },
          true
        );
        autoSaved = true;
      }
    }
  }

  // Save for an already signed-in browser session
  if (!autoSaved && save === "1") {
    const session = await getServerSession(authOptions);
    if (session?.user?.id || session?.user?.email) {
      const auth = await ensureAuthUserId({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      });
      if ("id" in auth) {
        await setSavedArticle(
          auth.id,
          {
            pmid: item.pmid,
            title: item.headline || item.title,
            pubmedUrl: item.pubmedUrl,
          },
          true
        );
        autoSaved = true;
      }
    }
  }

  const imageMap = await assignStoryImages([item]);
  const image = imageMap[item.pmid] ?? null;

  return (
    <BriefSitePage>
      <ArticlePermalinkView item={item} image={image} autoSaved={autoSaved} />
    </BriefSitePage>
  );
}
