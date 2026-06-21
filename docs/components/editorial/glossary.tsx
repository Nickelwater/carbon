import Link from "next/link";
import { glossaryEntries, termSlug } from "@/lib/glossary";

/**
 * Glossary — the whole `lib/glossary.ts` rendered as one reference page, in the
 * same hairline "environment list" language as <EnvVars>. Sourced directly from the
 * glossary object so the inline <Term> popovers, this page, and the search index can
 * never drift: add a term once in lib/glossary.ts and it shows up everywhere.
 *
 * Entries are deduped (aliases share one term) and grouped by first letter for
 * scannability; "8D" and any other digit-leading term fall under "#". Each row carries
 * an anchor id (termSlug) so a search hit can deep-link straight to the term.
 */
export function Glossary() {
  const entries = glossaryEntries();

  // Group into alphabetical sections (digits → "#").
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const first = entry.term[0].toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }

  return (
    <div className="my-[28px]">
      {[...groups.entries()].map(([letter, items]) => (
        <section key={letter} className="mb-[28px]">
          <h2
            id={`letter-${letter.toLowerCase()}`}
            className="!mt-0 !mb-[6px] scroll-mt-[88px] !border-0 font-[family-name:var(--font-mono)] !text-[12px] !font-[600] uppercase tracking-[0.08em] !text-[rgba(38,35,35,0.4)]"
          >
            {letter}
          </h2>
          <div className="divide-y divide-[#E7E7E3] border-y border-[#E7E7E3]">
            {items.map((entry) => (
              <div key={entry.term} id={termSlug(entry.term)} className="scroll-mt-[88px] py-[15px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[3px]">
                  <span className="text-[15px] font-[560] text-[#262323]">{entry.term}</span>
                  {entry.href && (
                    <Link
                      href={entry.href}
                      className="shrink-0 text-[12.5px] font-[500] text-[#1E84B0] no-underline hover:text-[#0C6E96]"
                    >
                      Learn more <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
                <p className="m-0 mt-[5px] text-[14px] leading-[155%] text-[rgba(38,35,35,0.66)]">
                  {entry.definition}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
