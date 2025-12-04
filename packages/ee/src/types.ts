import type { ZodType } from "zod/v3";

export type IntegrationConfig = {
  name: string;
  id: string;
  active: boolean;
  category: string;
  logo: React.FC<React.ComponentProps<"svg">>;
  shortDescription: string;
  description: string;
  setupInstructions?: React.FC<{ companyId: string }>;
  images: string[];
  settings: {
    name: string;
    label: string;
    type: "text" | "switch" | "processes" | "options" | "array";
    listOptions?: string[];
    required: boolean;
    value: unknown;
  }[];
  schema: ZodType;
  onInitialize?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
};
