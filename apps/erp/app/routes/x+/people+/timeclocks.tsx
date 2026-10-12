// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { isUnaffectedByNavigation, redirect } from "@carbon/utils";
import { msg } from "@lingui/core/macro";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunction
} from "react-router";
import { data, useLoaderData } from "react-router";
import {
  getTimeClockDevices,
  getTimeClockPunches,
  reprocessTimeClockPunch,
  updateTimeClockDevice
} from "~/modules/people";
import { TimeclocksTable } from "~/modules/people/ui/Timeclocks";
import { getCompanySettings } from "~/modules/settings";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: msg`Timeclocks`,
  to: path.to.peopleTimeclocks
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  isUnaffectedByNavigation(args, { search: "all" })
    ? false
    : args.defaultShouldRevalidate;

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "people"
  });

  const companySettings = await getCompanySettings(client, companyId);
  if (!companySettings.data?.timeCardEnabled) {
    throw redirect(
      path.to.people,
      await flash(
        request,
        error(
          null,
          "Timecards are not enabled. To enable this feature, go to Settings → People to enable Timecards."
        )
      )
    );
  }

  const [devices, punches] = await Promise.all([
    getTimeClockDevices(client, companyId),
    getTimeClockPunches(client, companyId, {
      status: "unmapped",
      limit: 50
    })
  ]);

  if (devices.error) {
    throw redirect(
      path.to.people,
      await flash(request, error(devices.error, "Failed to load timeclocks"))
    );
  }

  return {
    devices: devices.data ?? [],
    unmappedPunches: punches.data ?? []
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "people"
  });

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "toggleEnabled") {
    const id = String(formData.get("id") ?? "");
    const enabled = String(formData.get("enabled") ?? "") === "true";
    const result = await updateTimeClockDevice(client, companyId, userId, {
      id,
      enabled
    });
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to update device"))
      );
    }
    return data(
      { success: true },
      await flash(
        request,
        success(enabled ? "Device enabled" : "Device disabled")
      )
    );
  }

  if (intent === "toggleAutoPoll") {
    const id = String(formData.get("id") ?? "");
    const autoPoll = String(formData.get("autoPoll") ?? "") === "true";
    const result = await updateTimeClockDevice(client, companyId, userId, {
      id,
      autoPoll
    });
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to update auto-poll"))
      );
    }
    return data(
      { success: true },
      await flash(
        request,
        success(autoPoll ? "Auto-poll enabled" : "Auto-poll disabled")
      )
    );
  }

  if (intent === "collect" || intent === "collectAll") {
    const sn = String(formData.get("sn") ?? "");
    const mode = intent === "collectAll" ? "all" : "new";
    const port = process.env.TIMECLOCK_PORT?.trim() || "7788";
    try {
      const response = await fetch(`http://127.0.0.1:${port}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sn, mode })
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        return data(
          { success: false },
          await flash(
            request,
            error(
              null,
              body.error ?? "Collect failed — is the gateway running?"
            )
          )
        );
      }
      return data(
        { success: true },
        await flash(
          request,
          success(
            mode === "all"
              ? "Collect all punches requested"
              : "Collect requested"
          )
        )
      );
    } catch {
      return data(
        { success: false },
        await flash(
          request,
          error(
            null,
            "Collect failed — is the timeclock gateway running on port 7788?"
          )
        )
      );
    }
  }

  if (intent === "reprocess") {
    const punchId = String(formData.get("punchId") ?? "");
    const result = await reprocessTimeClockPunch(
      client,
      companyId,
      punchId,
      userId
    );
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to reprocess punch"))
      );
    }
    return data(
      { success: true },
      await flash(request, success("Punch reprocessed"))
    );
  }

  return data(
    { success: false },
    await flash(request, error(null, "Unknown action"))
  );
}

export default function TimeclocksRoute() {
  const { devices, unmappedPunches } = useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <TimeclocksTable devices={devices} unmappedPunches={unmappedPunches} />
    </VStack>
  );
}
