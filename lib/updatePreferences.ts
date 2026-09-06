import "server-only";
import { Resend } from "resend";
import { getAuthUsersClient } from "@/lib/supabaseServer";
import {
  DEFAULT_USER_PREFERENCES,
  sanitizeUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences";

type AuthUserRow = {
  id: string;
  email: string | null;
  email_frequency: string | null;
  settings_tags: string[] | null;
  topics_tags: string[] | null;
  high_impact_only: boolean | null;
};

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

function preferencesFromRow(row: AuthUserRow | null): UserPreferences {
  if (!row) return { ...DEFAULT_USER_PREFERENCES };
  return sanitizeUserPreferences({
    emailFrequency: row.email_frequency,
    settingsTags: row.settings_tags ?? [],
    topicsTags: row.topics_tags ?? [],
    highImpactOnly: row.high_impact_only ?? false,
  });
}

function resendProperties(preferences: UserPreferences): Record<string, string> {
  return {
    email_frequency: preferences.emailFrequency,
    settings_tags: preferences.settingsTags.join(","),
    topics_tags: preferences.topicsTags.join(","),
    high_impact_only: preferences.highImpactOnly ? "true" : "false",
  };
}

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("auth_users") ||
    m.includes("email_frequency")
  );
}

function storageNotReadyError(): string {
  return "Account storage is not ready. Run scripts/add_next_auth.sql in the Supabase SQL Editor.";
}

export async function getUserPreferences(userId: string): Promise<{
  preferences: UserPreferences;
  email: string | null;
  error?: string;
}> {
  try {
    const supabase = getAuthUsersClient();
    const { data, error } = await supabase
      .from("auth_users")
      .select(
        "id, email, email_frequency, settings_tags, topics_tags, high_impact_only"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error.message)) {
        return {
          preferences: { ...DEFAULT_USER_PREFERENCES },
          email: null,
          error: storageNotReadyError(),
        };
      }
      return {
        preferences: { ...DEFAULT_USER_PREFERENCES },
        email: null,
        error: error.message,
      };
    }

    const row = data as AuthUserRow | null;
    return {
      preferences: preferencesFromRow(row),
      email: row?.email ?? null,
    };
  } catch (err) {
    return {
      preferences: { ...DEFAULT_USER_PREFERENCES },
      email: null,
      error: err instanceof Error ? err.message : "Could not load preferences",
    };
  }
}

async function syncResendAudience(
  email: string,
  preferences: UserPreferences
): Promise<string | undefined> {
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();
  if (!audienceId) return undefined;

  const resend = getResendClient();
  const properties = resendProperties(preferences);
  const unsubscribed = preferences.emailFrequency === "none";

  const { error: updateError } = await resend.contacts.update({
    audienceId,
    email,
    unsubscribed,
    properties,
  });

  if (!updateError) return undefined;

  const notFound =
    updateError.statusCode === 404 ||
    /not found|does not exist/i.test(updateError.message ?? "");

  if (!notFound) {
    return updateError.message ?? "Could not update Resend contact";
  }

  const { error: createError } = await resend.contacts.create({
    audienceId,
    email,
    unsubscribed,
    properties,
  });

  if (createError) {
    return createError.message ?? "Could not add Resend contact";
  }
  return undefined;
}

/** Update auth_users preferences and sync Resend audience contact metadata. */
export async function updateUserPreferences(
  userId: string,
  rawPreferences: UserPreferences
): Promise<{ success: boolean; error?: string }> {
  const preferences = sanitizeUserPreferences(rawPreferences);

  try {
    const supabase = getAuthUsersClient();
    const { data: updated, error: userError } = await supabase
      .from("auth_users")
      .update({
        email_frequency: preferences.emailFrequency,
        settings_tags: preferences.settingsTags,
        topics_tags: preferences.topicsTags,
        high_impact_only: preferences.highImpactOnly,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("email")
      .maybeSingle();

    if (userError) {
      if (isMissingTable(userError.message)) {
        return { success: false, error: storageNotReadyError() };
      }
      return { success: false, error: userError.message };
    }

    const userEmail = (updated as { email?: string | null } | null)?.email;
    if (!userEmail) {
      return { success: false, error: "Could not find that account email." };
    }

    const resendError = await syncResendAudience(userEmail, preferences);
    if (resendError) {
      console.error("[updatePreferences] Resend sync failed:", resendError);
      return {
        success: true,
        error: `Saved in our records, but Resend was not updated: ${resendError}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[updatePreferences]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update preferences",
    };
  }
}
