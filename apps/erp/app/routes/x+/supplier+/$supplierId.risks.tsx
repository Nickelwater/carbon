import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";
import { data, useParams } from "react-router";
import SupplierRiskRegister from "~/modules/purchasing/ui/Supplier/SupplierRiskRegister";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermissions(request, {
    view: "purchasing"
  });

  return data({});
}

export default function SupplierRisksRoute() {
  const { supplierId } = useParams();
  if (!supplierId) throw new Error("Could not find supplierId");

  return <SupplierRiskRegister supplierId={supplierId} />;
}
