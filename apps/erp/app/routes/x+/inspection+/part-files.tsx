import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getItemFiles } from "~/modules/items";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    create: "quality"
  });

  const partId = new URL(request.url).searchParams.get("partId")?.trim();
  if (!partId) {
    return data({ files: [] });
  }

  const files = await getItemFiles(client, partId, companyId);
  const pdfFiles = files
    .filter((file) => file.name?.toLowerCase().endsWith(".pdf"))
    .map((file) => ({
      name: file.name,
      size: file.metadata?.size ?? null,
      createdAt: file.created_at ?? null
    }));

  return data({ files: pdfFiles });
}
