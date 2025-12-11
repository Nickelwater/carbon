import { requirePermissions } from "@carbon/auth/auth.server";
import { json, type ActionFunctionArgs } from "@vercel/remix";

export async function action({ request }: ActionFunctionArgs) {
  const { client, userId } = await requirePermissions(request, {
    update: "people",
  });

  const formData = await request.formData();
  const ids = formData.getAll("ids");
  const field = formData.get("field");
  const value = formData.get("value");

  if (typeof field !== "string" || typeof value !== "string") {
    return json({ error: { message: "Invalid form data" }, data: null });
  }

  switch (field) {
    case "content":
    case "name":
    case "status":
    case "type":
    case "frequency":
    case "estimatedDuration":
    case "description":
      return json(
        await client
          .from("training")
          .update({
            [field]: value,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          })
          .in("id", ids as string[])
      );
    case "tags":
      return json(
        await client
          .from("training")
          .update({
            [field]: formData.getAll("value") as string[],
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          })
          .in("id", ids as string[])
      );

    default:
      return json({ error: { message: "Invalid field" }, data: null });
  }
}
