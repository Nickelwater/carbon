import { openai } from "@ai-sdk/openai";
import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { generateObject } from "ai";
import type { ActionFunctionArgs } from "react-router";
import type { ZodSchema } from "zod";
import { z } from "zod";
import { importSchemas } from "~/modules/shared";

const inputSchema = z.object({
  fileColumns: z.array(z.string())
  // firstRows: z.array(z.record(z.string())),
});

export async function action({ request, params }: ActionFunctionArgs) {
  await requirePermissions(request, {});

  const { table } = params;
  if (!table) {
    throw notFound("No table parameter provided");
  }

  const result = inputSchema.safeParse(await request.json());
  if (!result.success) {
    throw notFound("Table not found in the list of supported tables");
  }

  const { fileColumns } = result.data;

  const schema = importSchemas[table as keyof typeof importSchemas].partial();

  if (!schema) {
    throw notFound("Table not found in the list of supported tables");
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema,
      prompt: `
      The following columns are the headings from a CSV import file for importing a ${table}. 
      Map these column names to the correct fields in our database (${[
        ...Object.keys(getZodSchemaFieldsShallow(schema))
      ].join(", ")}) by providing the matching column name for each field.
      
      If you are not sure or there is no matching column, please return "N/A". 
      
      Columns:
      ${fileColumns.join(",")}
      `,
      temperature: 0.2
    });

    return object;
  } catch (error) {
    console.error(error);
    return {} as Record<string, string>;
  }
}

export function getZodSchemaFieldsShallow(schema: ZodSchema) {
  const fields: Record<string, true> = {};
  const proxy = new Proxy(fields, {
    get(_, key) {
      if (key === "then" || typeof key !== "string") {
        return;
      }
      fields[key] = true;
    }
  });
  schema.safeParse(proxy);
  return fields;
}
