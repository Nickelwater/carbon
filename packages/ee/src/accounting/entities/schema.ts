import z from "zod";

function withNullable<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === undefined ? null : v), schema.nullish());
}

// export const BaseEntitySchema = z.object({
//   id: z.string(),
//   externalId: z.string().optional(), // Provider-specific ID
//   createdAt: z.string().datetime(),
//   updatedAt: z.string().datetime(),
//   lastSyncedAt: z.string().datetime().optional(),
// });

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  companyId: z.string(),
  email: z.string().optional(),
  website: withNullable(z.string().url()),
  taxId: withNullable(z.string()),
  currencyCode: z.string().default("USD"),
  balance: z.number().nullish(),
  creditLimit: z.number().nullish(),
  paymentTerms: z.string().nullish(),
  updatedAt: z.string().datetime(),
  phones: z.array(
    z.object({
      type: z.string().optional(),
      phone: z.string().optional()
    })
  ),
  addresses: z.array(
    z.object({
      label: z.string().nullish(),
      type: z.string().nullish(),
      line1: z.string().nullish(),
      line2: z.string().nullish(),
      city: z.string().nullish(),
      country: z.string().nullish(),
      region: z.string().nullish(),
      postalCode: z.string().nullish()
    })
  ),
  isVendor: z.boolean(),
  isCustomer: z.boolean()
});
