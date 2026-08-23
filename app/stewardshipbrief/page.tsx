import { redirect } from "next/navigation";
import { parseBriefSetting } from "@/lib/brief/settingFilter";
import { parseBriefTopic, briefHomeHref } from "@/lib/brief/topicFilter";

export const dynamic = "force-dynamic";

/** Legacy path — brief now lives at `/`. */
export default async function StewardshipBriefRedirect({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string; topic?: string }>;
}) {
  const { setting: settingRaw, topic: topicRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);
  const topic = parseBriefTopic(topicRaw);
  redirect(
    briefHomeHref({
      setting: setting || undefined,
      topic: topic || undefined,
    })
  );
}
