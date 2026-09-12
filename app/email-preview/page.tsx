import { redirect } from "next/navigation";

export default async function EmailPreviewRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  if (secret) {
    redirect(`/email_preview?secret=${encodeURIComponent(secret)}`);
  }
  redirect("/email_preview");
}
