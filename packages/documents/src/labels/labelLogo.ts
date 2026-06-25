import type { LabelSize } from "@carbon/utils";
import type { DocumentTemplate } from "../template";
import { resolveTemplate } from "../template";

export interface ResolvedLabelLogo {
  /** Color logo URL for the PDF. */
  color?: string | null;
  /** Monochrome PNG data URL (PDF B&W). */
  mono?: string | null;
  /** ZPL `^GFA` graphic field. */
  gfa?: string | null;
  /** Rendered logo width in dots (for ZPL placement). */
  widthDots?: number;
}

export type ResolveLabelLogoOptions = {
  supabaseUrl: string;
  /** Use the company logo when the tracking-label template has no logo block. */
  fallbackToCompanyLogo?: boolean;
  /** Override the template logo variant (`icon` = symbol/mark, `mark` = wordmark). */
  logoVariant?: "mark" | "icon";
  /** Fraction of label width used for ZPL logo rendering (default 0.3). */
  logoWidthFraction?: number;
};

/**
 * If the tracking-label template has a visible logo block, resolve the company
 * logo into a color URL (PDF), a monochrome PNG (PDF B&W) and a ZPL `^GFA`
 * graphic — the last two via the `logo-resizer` edge function (ImageMagick).
 * Returns null when there's no logo block or no company logo, unless
 * `fallbackToCompanyLogo` is set. `supabaseUrl` is passed in so this stays
 * free of app-specific auth imports.
 */
export async function resolveLabelLogo(
  company: { logoLight?: string | null; logoLightIcon?: string | null } | null,
  template: DocumentTemplate | null,
  labelSize: LabelSize,
  {
    supabaseUrl,
    fallbackToCompanyLogo = false,
    logoVariant,
    logoWidthFraction = 0.3
  }: ResolveLabelLogoOptions
): Promise<ResolvedLabelLogo | null> {
  const resolved = resolveTemplate("trackingLabel", template);
  const logoBlock = resolved.blocks.find(
    (b) => b.type === "labelLogo" && b.visible
  );

  const logoBlockVisible = logoBlock?.type === "labelLogo";
  if (!logoBlockVisible && !fallbackToCompanyLogo) {
    return null;
  }

  const variant =
    logoVariant ?? (logoBlockVisible ? logoBlock.variant : "mark");
  const crop =
    logoBlockVisible && logoBlock.variant === variant
      ? logoBlock.crop
      : undefined;

  const color =
    variant === "icon"
      ? (company?.logoLightIcon ?? company?.logoLight)
      : (company?.logoLight ?? company?.logoLightIcon);
  if (!color) return null;

  const dpi = labelSize.zpl?.dpi ?? 203;
  const labelInches = labelSize.zpl?.width ?? labelSize.width;
  const widthDots = Math.round(labelInches * dpi * logoWidthFraction);

  try {
    const imgRes = await fetch(color);
    const blob = await imgRes.blob();
    const formData = new FormData();
    formData.append("file", blob, "logo.png");
    formData.append("widthDots", String(widthDots));
    if (crop) {
      // ZPL/mono can't clip at render — crop server-side before threshold.
      formData.append("cropX", String(crop.x));
      formData.append("cropY", String(crop.y));
      formData.append("cropW", String(crop.width));
      formData.append("cropH", String(crop.height));
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/logo-resizer`, {
      method: "POST",
      body: formData
    });
    const json = (await res.json()) as {
      monoPng?: string;
      gfa?: string;
      widthDots?: number;
    };
    return {
      color,
      mono: json.monoPng,
      gfa: json.gfa,
      widthDots: json.widthDots
    };
  } catch {
    // Edge function unavailable — color logo still works in the PDF.
    return { color };
  }
}
