import { useState } from "react";
import { useParams } from "react-router";
import type { z } from "zod";
import { useUser } from "~/hooks";
import type {
  shipmentStatusType,
  shipmentValidator
} from "~/modules/inventory";

export default function useShipmentForm({
  initialValues
}: {
  initialValues: z.infer<typeof shipmentValidator>;
  status: (typeof shipmentStatusType)[number];
}) {
  const { shipmentId } = useParams();
  if (!shipmentId) throw new Error("shipmentId not found");

  const user = useUser();
  const [locationId, setLocationId] = useState<string | null>(
    initialValues.locationId ?? user.defaults?.locationId ?? null
  );

  return {
    locationId,
    setLocationId
  };
}
