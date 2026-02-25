import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useParams } from "react-router";
import { PanelProvider } from "~/components/Layout";
import {
  getAvailableSalesOrderLinesForCustomer,
  getShipment,
  getShipmentLines,
  getShipmentRelatedItems,
  getShipmentTracking
} from "~/modules/inventory";
import ShipmentHeader from "~/modules/inventory/ui/Shipments/ShipmentHeader";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: "Shipments",
  to: path.to.shipments
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { shipmentId } = params;
  if (!shipmentId) throw new Error("Could not find shipmentId");

  const [shipment, shipmentLines, shipmentLineTracking] = await Promise.all([
    getShipment(client, shipmentId),
    getShipmentLines(client, shipmentId),
    getShipmentTracking(client, shipmentId, companyId)
  ]);

  if (shipment.error) {
    throw redirect(
      path.to.shipments,
      await flash(request, error(shipment.error, "Failed to load shipment"))
    );
  }

  if (shipment.data.companyId !== companyId) {
    throw redirect(path.to.shipments);
  }

  const relatedItems =
    shipment.data?.sourceDocumentId &&
    shipment.data.sourceDocumentId.trim() !== ""
      ? await getShipmentRelatedItems(
          client,
          shipmentId,
          shipment.data.sourceDocumentId
        )
      : { invoices: [] };

  const availableShipmentLines =
    shipment.data?.customerId && !shipment.data.postedAt
      ? await getAvailableSalesOrderLinesForCustomer(
          client,
          shipment.data.customerId,
          shipment.data.companyId,
          { excludeShipmentId: shipmentId }
        )
      : { data: [] };

  return {
    shipment: shipment.data,
    shipmentLines: shipmentLines.data ?? [],
    shipmentLineTracking: shipmentLineTracking.data ?? [],
    relatedItems,
    availableShipmentLines: availableShipmentLines.data ?? []
  };
}

export default function ShipmentRoute() {
  const params = useParams();
  const { shipmentId } = params;
  if (!shipmentId) throw new Error("Could not find shipmentId");

  return (
    <PanelProvider>
      <div className="flex flex-col h-[calc(100dvh-49px)] overflow-hidden w-full">
        <ShipmentHeader />
        <div className="flex h-[calc(100dvh-99px)] overflow-y-auto scrollbar-hide w-full">
          <VStack spacing={4} className="h-full p-2 w-full max-w-5xl mx-auto">
            <Outlet />
          </VStack>
        </div>
      </div>
    </PanelProvider>
  );
}
