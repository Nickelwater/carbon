import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import { disposition } from "~/modules/quality/quality.models";

export async function action({ request }: ActionFunctionArgs) {
  const { client, userId } = await requirePermissions(request, {
    update: "quality"
  });

  const formData = await request.formData();
  const id = formData.get("id");
  const field = formData.get("field");
  const value = formData.get("value");

  if (typeof id !== "string") {
    return {
      error: { message: "Invalid nonConformanceItem id" },
      data: null
    };
  }

  if (
    typeof field !== "string" ||
    (typeof value !== "string" && value !== null)
  ) {
    return { error: { message: "Invalid form data" }, data: null };
  }

  switch (field) {
    case "disposition":
      if (
        value === null ||
        !disposition.includes(value as (typeof disposition)[number])
      ) {
        return {
          error: { message: "Invalid disposition" },
          data: null
        };
      }
      return await client
        .from("nonConformanceItem")
        .update({
          [field]: value ? (value as (typeof disposition)[number]) : null,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .eq("id", id);
    case "quantity":
      const quantity = parseFloat(value || "0");
      if (isNaN(quantity) || quantity < 0) {
        return {
          error: { message: "Invalid quantity" },
          data: null
        };
      }
      return await client
        .from("nonConformanceItem")
        .update({
          quantity,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .eq("id", id);
    default:
      return {
        error: { message: `Invalid field: ${field}` },
        data: null
      };
  }
}
