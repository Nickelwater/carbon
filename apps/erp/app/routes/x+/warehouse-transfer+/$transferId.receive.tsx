import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { path } from "~/utils/path";

export async function loader({ params }: LoaderFunctionArgs) {
  const { transferId } = params;
  if (!transferId) throw new Error("transferId not found");

  // Redirect to create a new receipt with the warehouse transfer as the source document
  const url = path.to.newReceipt;
  const searchParams = new URLSearchParams({
    sourceDocument: "Inbound Transfer",
    sourceDocumentId: transferId
  });

  throw redirect(`${url}?${searchParams.toString()}`);
}
