import { useRouteData } from "@carbon/react";
import { path } from "~/utils/path";

/**
 * Companysettings shape exposed from the authenticated root loader. Returns
 * undefined when called outside an authenticated route (e.g. share/public
 * pages). Consumers should treat absent fields as their default.
 */
type CompanySettings = {
  showSupplierReadableId?: boolean | null;
  showCustomerReadableId?: boolean | null;
} & Record<string, unknown>;

export function useCompanySettings(): CompanySettings | undefined {
  const data = useRouteData<{ companySettings?: CompanySettings }>(
    path.to.authenticatedRoot
  );
  return data?.companySettings;
}
