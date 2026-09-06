"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";

function emailInitial(email: string | null | undefined): string {
  const ch = (email ?? "?").trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

export default function SiteNavAccount({ active }: { active?: boolean }) {
  const { data: session, status } = useSession();
  const signedIn = Boolean(session?.user?.id);
  const initial = emailInitial(session?.user?.email);

  if (signedIn) {
    return (
      <li>
        <Link
          href="/settings"
          aria-current={active ? "page" : undefined}
          aria-label={`Account, signed in as ${session?.user?.email ?? "you"}`}
          title={session?.user?.email ?? "Account"}
          className={`inline-flex items-center gap-1.5 rounded-full border px-1.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] ${
            active
              ? "border-[#1C0B19] bg-[#1C0B19]/5"
              : "border-[#D8D4C8] hover:border-[#1C0B19]/50"
          } ${status === "loading" ? "opacity-50" : ""}`}
        >
          <span
            className={`${brief.sans} flex h-6 w-6 items-center justify-center rounded-full bg-[#1C0B19] text-[0.6875rem] font-semibold text-[#F6F4EF]`}
            aria-hidden
          >
            {initial}
          </span>
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2A79A7] text-[#F6F4EF]"
            aria-hidden
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.2 4.8 8.5 9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href="/settings"
        aria-current={active ? "page" : undefined}
        className={`${brief.sans} inline-block border-b border-transparent px-2 py-1.5 text-[0.6875rem] font-medium tracking-[0.02em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] sm:px-2.5 sm:text-[0.8125rem] ${
          active
            ? "border-[#1C0B19] text-[#1C0B19]"
            : "text-[#72705B] hover:border-[#1C0B19]/40 hover:text-[#1C0B19]"
        } ${status === "loading" ? "opacity-50" : ""}`}
      >
        Sign in
      </Link>
    </li>
  );
}
