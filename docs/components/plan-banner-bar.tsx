"use client";

import { usePathname } from "next/navigation";

/* Full-width sticky announcement bar for plan-gated pages. The docs layout builds a
 * url→plan map from `plan` frontmatter and passes it in; this matches the current path
 * and, when the page is gated, renders the bar across the whole content area (everything
 * to the right of the left nav). Pinned just under the fixed 64px header. */
export function PlanBannerBar({ plans }: { plans: Record<string, string> }) {
  const pathname = usePathname();
  const plan = plans[pathname] ?? plans[pathname.replace(/\/$/, "")];
  if (!plan) return null;

  return (
    <div className="sticky top-16 z-40 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#e0c389] bg-[#fbe7b8] px-6 py-3 text-ed-14 leading-[150%] text-[#6b4a1d] lg:px-14">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="2.6" y="6.3" width="8.8" height="5.6" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.5 6.3V4.7a2.5 2.5 0 0 1 5 0v1.6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="font-semi text-[#4a3211]">Enterprise feature</span>
      <span className="font-book">
        — included with the {plan} and Partner plans on{" "}
        <a
          href="https://app.carbon.ms"
          className="font-semi text-[#4a3211] underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          Carbon Cloud
        </a>
        . Self-hosted, it needs a commercial license.
      </span>
      <a
        href="/docs/platform/licensing"
        className="ml-1 font-semi text-[#4a3211] underline underline-offset-2 transition-opacity hover:opacity-70"
      >
        Licensing →
      </a>
    </div>
  );
}
