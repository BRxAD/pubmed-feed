"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";

function emailInitial(email: string | null): string {
  const ch = (email ?? "?").trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

export default function AccountSignedInHeader({
  email,
}: {
  email: string | null;
}) {
  const initial = emailInitial(email);

  return (
    <div className="rounded-sm border border-[#D8D4C8] bg-white p-6 shadow-[0_1px_2px_rgba(28,11,25,0.04)] sm:p-8">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1C0B19] text-xl font-semibold text-[#F6F4EF]"
            aria-hidden
          >
            {initial}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#2A79A7] text-[#F6F4EF] ring-2 ring-white"
            title="Signed in"
            aria-hidden
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.2 4.8 8.5 9.5 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <p className={`mt-4 ${brief.kicker}`}>You&apos;re signed in</p>
        <p className={`mt-2 ${brief.sans} text-sm ${brief.ink}`}>
          {email ?? "Your account"}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className={`${brief.sans} inline-flex items-center justify-center rounded-sm bg-[#1C0B19] px-5 py-2.5 text-sm font-semibold tracking-wide text-[#F6F4EF] transition-colors hover:bg-[#2A79A7]`}
          >
            Back to the brief
          </Link>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/settings" })}
            className={`${brief.sans} text-sm ${brief.action}`}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
