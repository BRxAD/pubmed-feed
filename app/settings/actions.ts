"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { updateUserPreferences } from "@/lib/updatePreferences";
import { registerPasswordUser } from "@/lib/passwordAuth";
import {
  sanitizeUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences";

export async function saveEmailPreferences(
  input: UserPreferences
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, error: "Please sign in to save preferences." };
  }

  const preferences = sanitizeUserPreferences(input);
  const result = await updateUserPreferences(userId, preferences);

  if (!result.success) {
    return { ok: false, error: result.error ?? "Could not save preferences." };
  }

  if (result.error) {
    return { ok: true, warning: result.error };
  }

  return { ok: true };
}

export async function registerPasswordAccount(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return registerPasswordUser(input.email, input.password);
}
