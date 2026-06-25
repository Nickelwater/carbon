import { requirePermissions } from "@carbon/auth/auth.server";
import { generateShippingLabelZPL } from "@carbon/documents/zpl";
import { labelSizes } from "@carbon/utils";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { loadShippingLabelItems } from "~/modules/inventory/shipping-label.server";
import { getCompany, getDocumentTemplateConfig } from "~/modules/settings";
import { resolveLabelLogo } from "~/modules/settings/labelLogo.server";
import { path } from "~/utils/path";

const DEFAULT_SHIPPING_LABEL_SIZE = "label4x6";

function parseShippingLabelSearchParams(url: URL) {
  const lineId = url.searchParams.get("lineId") ?? undefined;
  const packageIndex = Number(url.searchParams.get("package") ?? "1");
  const packageCount = Number(url.searchParams.get("of") ?? "1");
  const labelSizeId =
    url.searchParams.get("labelSize") ?? DEFAULT_SHIPPING_LABEL_SIZE;

  return {
    lineId,
    packageIndex: Number.isFinite(packageIndex) ? packageIndex : 1,
    packageCount: Number.isFinite(packageCount) ? packageCount : 1,
    labelSizeId
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const url = new URL(request.url);
  const { lineId, packageIndex, packageCount, labelSizeId } =
    parseShippingLabelSearchParams(url);

  const labelSize = labelSizes.find((size) => size.id === labelSizeId);
  if (!labelSize) {
    throw new Error("Invalid label size");
  }

  if (!labelSize.zpl) {
    throw redirect(
      path.to.file.shipmentShippingLabelPdf(id, {
        labelSize: labelSize.id,
        lineId,
        package: packageIndex,
        of: packageCount
      })
    );
  }

  const [items, company, template] = await Promise.all([
    loadShippingLabelItems(client, companyId, id, {
      lineId,
      packageIndex,
      packageCount
    }),
    getCompany(client, companyId),
    getDocumentTemplateConfig(client, companyId, "trackingLabel")
  ]);

  if (items.length === 0) {
    return new Response("No shippable lines found for this shipment", {
      status: 404
    });
  }

  const logo = await resolveLabelLogo(company.data, template, labelSize, {
    fallbackToCompanyLogo: true,
    logoVariant: "icon",
    logoWidthFraction: 0.2
  });
  const zplOutput = items
    .map((item) => generateShippingLabelZPL(item, labelSize, logo))
    .join("\n");

  return new Response(zplOutput, {
    status: 200,
    headers: {
      "Content-Type": "application/zpl",
      "Content-Disposition": `attachment; filename="shipping-labels-${id}.zpl"`
    }
  });
}
