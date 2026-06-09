import { cn } from "@carbon/react";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const button = cva(
  "inline-flex items-center gap-[7px] rounded-lg font-semibold cursor-pointer transition-[transform,border-color,box-shadow] duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:-translate-y-px hover:shadow-[0_5px_14px_-5px_rgba(0,0,0,0.14)] active:scale-[0.96]",
  {
    variants: {
      variant: {
        secondary: "bg-card text-foreground border border-border",
        accent: "bg-[var(--acc)] text-white border border-[var(--acc)]",
        primary: "bg-foreground text-background border border-foreground"
      },
      size: { md: "h-10 px-4 text-[0.85rem]", sm: "h-8 px-3 text-[0.8rem]" }
    },
    defaultVariants: { variant: "secondary", size: "md" }
  }
);

export function McpButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"a"> & VariantProps<typeof button>) {
  return <a className={cn(button({ variant, size }), className)} {...props} />;
}
