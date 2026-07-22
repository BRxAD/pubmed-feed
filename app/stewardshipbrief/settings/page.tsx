import Link from "next/link";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import SettingsDashboard from "@/components/brief/SettingsDashboard";
import SettingsUnlock from "@/components/brief/SettingsUnlock";
import { brief } from "@/components/brief/briefTheme";

export const metadata = {
  title: "Brief settings — The Stewardship Brief",
  robots: { index: false, follow: false },
};

export default async function BriefSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  const authorized = verifyBriefAdminSecret(secret);

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-10 pb-6 border-b-2 border-[#1C0B19]">
          <p className={`${brief.kicker} mb-2`}>Admin</p>
          <h1
            className={`${brief.serif} text-3xl font-semibold tracking-tight`}
          >
            Relevance &amp; brief settings
          </h1>
          <p className={`mt-3 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
            Tune scoring weights, down-rates, and which articles appear on the
            daily brief.
          </p>
          <Link
            href="/"
            className={`mt-4 inline-block ${brief.sans} text-sm ${brief.accent}`}
          >
            ← The Stewardship Brief
          </Link>
        </header>

        {authorized && secret ? (
          <SettingsDashboard initialSecret={secret} />
        ) : (
          <SettingsUnlock />
        )}
      </div>
    </div>
  );
}
