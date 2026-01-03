import z from "zod";

/**
 * Provider core interfaces and base classes.
 */
export type ProviderConfig<T = unknown> = {
  id: ProviderID;
  companyId: string;
  onTokenRefresh?: (creds: ProviderCredentials) => void;
} & T;

export enum ProviderID {
  XERO = "xero"
  // QUICKBOOKS = "quickbooks"
  // SAGE = "sage",
}

/**
 * Schemas for shared provider entities and credentials.
 */
export const ProviderCredentialsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oauth2"),
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
    scope: z.array(z.string()).optional(),
    tenantId: z.string().optional()
  })
]);

export type ProviderCredentials = z.output<typeof ProviderCredentialsSchema>;

export const ExternalIdSchema = z.object({
  [`${ProviderID.XERO}`]: z.object({
    id: z.string(),
    provider: z.literal(ProviderID.XERO),
    metadata: z.record(z.any()).optional()
  })
  // [`${ProviderID.QUICKBOOKS}`]: z.object({
  //   id: z.string(),
  //   provider: z.literal(ProviderID.QUICKBOOKS),
  //   metadata: z.record(z.any()).optional()
  // })
});
