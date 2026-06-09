import { useState } from "react";

export function ImagePlaceholder({
  src,
  alt,
  ratio = "16 / 9"
}: {
  src?: string;
  alt: string;
  ratio?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Show the real screenshot once it exists; fall back to the labelled
  // placeholder while a src is missing or 404s (so it's never a broken image).
  if (src && !failed) {
    return (
      <img
        className="w-full rounded-[9px] block outline outline-1 outline-black/10 -outline-offset-1"
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="w-full rounded-[9px] flex items-center justify-center bg-muted border border-dashed border-border text-muted-foreground"
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={alt}
    >
      <span className="font-[var(--mono)] text-[0.72rem] tracking-[0.04em] px-[14px] py-[10px] text-center">
        {alt}
      </span>
    </div>
  );
}
