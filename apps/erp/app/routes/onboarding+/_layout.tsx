import { CarbonEdition } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";

import { TooltipProvider } from "@carbon/react";

import { getStripeCustomerByCompanyId } from "@carbon/stripe/stripe.server";
import { Edition } from "@carbon/utils";
import type {
  LoaderFunctionArgs,
  ShouldRevalidateFunction
} from "react-router";
import { Outlet, redirect } from "react-router";
import { getLocationsList } from "~/modules/resources";
import { getCompany } from "~/modules/settings";
import { onboardingSequence, path } from "~/utils/path";

export const shouldRevalidate: ShouldRevalidateFunction = () => true;

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});

  const [company, stripeCustomer, locations] = await Promise.all([
    getCompany(client, companyId),
    getStripeCustomerByCompanyId(companyId, userId),
    getLocationsList(client, companyId)
  ]);

  const pathname = new URL(request.url).pathname;

  if (company.data?.name && locations.data?.length) {
    if (CarbonEdition !== Edition.Cloud || stripeCustomer) {
      throw redirect(path.to.authenticatedRoot);
    }

    if (
      CarbonEdition === Edition.Cloud &&
      pathname !== path.to.onboarding.plan
    ) {
      throw redirect(path.to.onboarding.plan);
    }
  }

  const onboardingSteps =
    CarbonEdition === Edition.Cloud
      ? onboardingSequence
      : onboardingSequence.filter((p) => p !== path.to.onboarding.plan);

  const pathIndex = onboardingSteps.findIndex((p) => p === pathname);

  const previousPath =
    pathIndex === 0 ? undefined : onboardingSteps[pathIndex - 1];

  const nextPath =
    pathIndex === onboardingSteps.length - 1
      ? path.to.authenticatedRoot
      : onboardingSteps[pathIndex + 1];

  return {
    currentIndex: pathIndex,
    onboardingSteps: onboardingSteps.length,
    previousPath,
    nextPath
  };
}

export default function OnboardingLayout() {
  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain p-4">
        <div className="mx-auto my-auto w-full min-w-0 max-w-2xl shrink-0 py-4">
          <Outlet />
        </div>
      </div>
    </TooltipProvider>
  );
}
