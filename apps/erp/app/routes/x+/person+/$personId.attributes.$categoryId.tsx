import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@carbon/react";
import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@vercel/remix";
import { json, redirect } from "@vercel/remix";
import { getAttributeCategoryWithValues } from "~/modules/account";
import { UserAttributesForm } from "~/modules/account/ui/UserAttributes";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "people",
  });

  const { personId, categoryId } = params;
  if (!personId) throw new Error("Could not find personId");
  if (!categoryId) throw new Error("Could not find categoryId");

  const category = await getAttributeCategoryWithValues(
    client,
    categoryId,
    personId,
    companyId
  );

  if (category.error || !category.data) {
    throw redirect(
      path.to.person(personId),
      await flash(
        request,
        error(category.error, "Failed to load attribute category")
      )
    );
  }

  return json({
    category: category.data,
  });
}

export default function PersonAttributeCategoryRoute() {
  const { category } = useLoaderData<typeof loader>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {category.emoji ? <span>{category.emoji}</span> : null}{" "}
          {category.name}
        </CardTitle>
        <CardDescription>
          <Badge variant={category.public ? "default" : "secondary"}>
            {category.public ? "Public" : "Private"}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UserAttributesForm attributeCategory={category} />
      </CardContent>
    </Card>
  );
}
