import {
  QUICKBOOKS_CLIENT_ID,
  QUICKBOOKS_CLIENT_SECRET,
  VERCEL_URL
} from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { QuickBooks } from "@carbon/ee";
import { QuickBooksProvider } from "@carbon/ee/quickbooks";
import { data, type LoaderFunctionArgs, redirect } from "react-router";
import z from "zod";
import { upsertCompanyIntegration } from "~/modules/settings/settings.server";
import { oAuthCallbackSchema } from "~/modules/shared";
import { path } from "~/utils/path";

export const config = {
  runtime: "nodejs"
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, userId, companyId } = await requirePermissions(request, {
    update: "settings"
  });

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());

  const quickbooksAuthResponse = oAuthCallbackSchema
    .extend({
      realmId: z.string()
    })
    .safeParse(searchParams);

  if (!quickbooksAuthResponse.success) {
    return data({ error: "Invalid QuickBooks auth response" }, { status: 400 });
  }

  const { data: d } = quickbooksAuthResponse;

  // TODO: Verify state parameter
  if (!d.state) {
    return data({ error: "Invalid state parameter" }, { status: 400 });
  }

  if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET) {
    return data({ error: "QuickBooks OAuth not configured" }, { status: 500 });
  }

  try {
    // Use the QuickBooksProvider to handle the OAuth flow
    const provider = new QuickBooksProvider({
      companyId,
      clientId: QUICKBOOKS_CLIENT_ID,
      clientSecret: QUICKBOOKS_CLIENT_SECRET,
      redirectUri: `${url.origin}/api/integrations/quickbooks/oauth`,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "sandbox"
    });

    // Exchange the authorization code for tokens

    const auth = await provider.authenticate(
      d.code,
      provider.config.redirectUri!
    );

    if (!auth) {
      return data(
        { error: "Failed to exchange code for token" },
        { status: 500 }
      );
    }

    const createdQuickBooksIntegration = await upsertCompanyIntegration(
      client,
      {
        id: QuickBooks.id,
        active: true,
        // @ts-ignore
        metadata: {
          ...auth,
          tenantId: d.realmId
        },
        updatedBy: userId,
        companyId: companyId
      }
    );

    if (createdQuickBooksIntegration?.data?.metadata) {
      const requestUrl = new URL(request.url);

      if (!VERCEL_URL || VERCEL_URL.includes("localhost")) {
        requestUrl.protocol = "http";
      }

      const redirectUrl = `${requestUrl.origin}${path.to.integrations}`;

      return redirect(redirectUrl);
    } else {
      return data(
        { error: "Failed to save QuickBooks integration" },
        { status: 500 }
      );
    }
  } catch (err) {
    return data(
      { error: "Failed to exchange code for token" },
      { status: 500 }
    );
  }
}
