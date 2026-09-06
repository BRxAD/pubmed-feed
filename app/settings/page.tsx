import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserPreferences } from "@/lib/updatePreferences";
import { listSavedArticles } from "@/lib/savedArticles";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import BriefSitePage from "@/components/brief/BriefSitePage";
import AccountSignIn from "@/components/brief/AccountSignIn";
import AccountSignedInHeader from "@/components/brief/AccountSignedInHeader";
import AccountProfileTabs, {
  type AccountTab,
} from "@/components/brief/AccountProfileTabs";
import { brief } from "@/components/brief/briefTheme";
import { DEFAULT_USER_PREFERENCES } from "@/lib/userPreferences";

export const metadata: Metadata = {
  title: "Account — The Stewardship Brief",
  description:
    "Sign in to save articles and choose how often you get The Stewardship Brief.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseTab(raw: string | undefined): AccountTab {
  return raw === "saved" ? "saved" : "email";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string }>;
}) {
  const { error: authError, tab: tabRaw } = await searchParams;
  const tab = parseTab(tabRaw);
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.id);

  let preferences = DEFAULT_USER_PREFERENCES;
  let email = session?.user?.email ?? null;
  let loadError: string | undefined;
  let savedBriefItems: Awaited<ReturnType<typeof getBriefItemsForSaved>> = [];
  let savedError: string | undefined;

  if (session?.user?.id) {
    const loaded = await getUserPreferences(session.user.id);
    preferences = loaded.preferences;
    email = loaded.email ?? email;
    loadError = loaded.error;

    const saved = await listSavedArticles(session.user.id);
    savedError = saved.error;
    if (saved.items.length > 0) {
      savedBriefItems = await getBriefItemsForSaved(saved.items);
    }
  }

  const signInError =
    authError === "Callback" || authError === "OAuthCallback"
      ? "Google sign-in could not finish. Run scripts/add_next_auth.sql in Supabase, then try again."
      : authError === "OAuthAccountNotLinked"
        ? "That Google email already has a password account. Sign in with email instead."
        : authError
          ? "Sign-in did not complete. Try again."
          : null;

  return (
    <BriefSitePage active="/settings">
      <section className={`${brief.shell} py-12 sm:py-16`}>
        <div
          className={`mx-auto ${tab === "saved" ? "max-w-2xl" : "max-w-3xl"}`}
        >
          {signedIn ? (
            <div className="space-y-10">
              <AccountSignedInHeader email={email} />
              <AccountProfileTabs
                tab={tab}
                email={email}
                preferences={preferences}
                prefsError={loadError}
                savedItems={savedBriefItems}
                savedError={savedError}
              />
            </div>
          ) : (
            <AccountSignIn
              googleEnabled={Boolean(
                process.env.GOOGLE_CLIENT_ID?.trim() &&
                  process.env.GOOGLE_CLIENT_SECRET?.trim()
              )}
              initialError={signInError}
            />
          )}
        </div>
      </section>
    </BriefSitePage>
  );
}
