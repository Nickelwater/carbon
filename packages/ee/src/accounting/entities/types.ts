import { Database, Json } from "@carbon/database";
import z from "zod";
import { ContactSchema } from "./schema";

export type AccountingEntityType = "customer" | "vendor";
// Uncomment and expand as needed
// | "bill" // Purchase Invoice
// | "employee"
// | "invoice"
// | "item"
// | "purchase_order"
// | "sales_order"
// | "inventory_adjustment";

export interface EntityMap {
  customer: Accounting.Contact;
  vendor: Accounting.Contact;
}

export namespace Accounting {
  export type Contact = z.infer<typeof ContactSchema>;
}

export type TablesWithExternalId = {
  [K in keyof Database["public"]["Tables"]]: Database["public"]["Tables"][K]["Row"] extends {
    externalId: Json;
    companyId: string;
  }
    ? K
    : never;
}[keyof Database["public"]["Tables"]];
