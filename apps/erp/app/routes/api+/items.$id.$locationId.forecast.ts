import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { getLocalTimeZone, startOfWeek, today } from "@internationalized/date";
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  getItemDemand,
  getItemQuantities,
  getItemSupply,
  getOpenJobMaterials,
  getOpenProductionOrders,
  getOpenPurchaseOrderLines,
  getOpenSalesOrderLines
} from "~/modules/items/items.service";
import { getPeriods } from "~/modules/shared/shared.service";

const defaultResponse = {
  demand: [],
  demandForecast: [],
  supply: [],
  periods: [],
  quantityOnHand: 0,
  openSalesOrderLines: [],
  openJobMaterials: [],
  openProductionOrders: [],
  openPurchaseOrderLines: []
};

const WEEKS_TO_FORECAST = 12 * 4;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "parts"
  });

  const { id: itemId, locationId } = params;
  if (!itemId) throw new Error("Could not find itemId");
  if (!locationId) throw new Error("Could not find locationId");

  const startDate = startOfWeek(today(getLocalTimeZone()), "en-US");
  const endDate = startDate.add({ weeks: WEEKS_TO_FORECAST });
  const periods = await getPeriods(client, {
    startDate: startDate.toString(),
    endDate: endDate.toString()
  });

  if (periods.error) {
    return data(
      defaultResponse,
      await flash(request, error(periods.error, "Failed to load periods"))
    );
  }

  const [
    demand,
    supply,
    quantities,
    openSalesOrderLines,
    openJobMaterials,
    openProductionOrders,
    openPurchaseOrderLines
  ] = await Promise.all([
    getItemDemand(client, {
      itemId,
      locationId,
      periods: periods.data.map((p) => p.id ?? ""),
      companyId
    }),
    getItemSupply(client, {
      itemId,
      locationId,
      periods: periods.data.map((p) => p.id ?? ""),
      companyId
    }),
    getItemQuantities(client, itemId, companyId, locationId),
    getOpenSalesOrderLines(client, { itemId, companyId, locationId }),
    getOpenJobMaterials(client, { itemId, companyId, locationId }),
    getOpenProductionOrders(client, { itemId, companyId, locationId }),
    getOpenPurchaseOrderLines(client, { itemId, companyId, locationId })
  ]);

  if (demand.actuals.length === 0 && demand.forecasts.length === 0) {
    return data(
      defaultResponse,
      await flash(request, error(null, "Failed to load demand"))
    );
  }

  return {
    demand: demand.actuals,
    demandForecast: demand.forecasts,
    supply: [
      ...supply.actuals,
      ...supply.forecasts.map((f) => ({
        ...f,
        actualQuantity: f.forecastQuantity
      }))
    ],
    periods: periods.data,
    quantityOnHand: quantities.data?.quantityOnHand ?? 0,
    openSalesOrderLines: openSalesOrderLines.data ?? [],
    openJobMaterials: openJobMaterials.data ?? [],
    openProductionOrders: openProductionOrders.data ?? [],
    openPurchaseOrderLines: openPurchaseOrderLines.data ?? []
  };
}
