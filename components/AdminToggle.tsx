"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  isAdmin: boolean;
  basePath: string;
};

export default function AdminToggle({ isAdmin, basePath }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (isAdmin) {
      params.delete("admin");
    } else {
      params.set("admin", "1");
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }, [isAdmin, basePath, router, searchParams]);

  return (
    <button
      onClick={toggle}
      aria-pressed={isAdmin}
      title={isAdmin ? "Hide admin details" : "Show admin details"}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        isAdmin
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-700/60 dark:text-zinc-400 dark:hover:bg-zinc-600/60"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      {isAdmin ? "Admin on" : "Admin"}
    </button>
  );
}
