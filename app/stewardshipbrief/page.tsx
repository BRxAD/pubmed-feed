import { redirect } from "next/navigation";
import { parseBriefSetting } from "@/lib/brief/settingFilter";

export const dynamic = "force-dynamic";

/** Legacy path — brief now lives at `/`. */
export default async function StewardshipBriefRedirect({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string }>;
}) {
  const { setting: settingRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);
  if (setting) {
    redirect(`/?setting=${encodeURIComponent(setting)}`);
  }
  redirect("/");
}
