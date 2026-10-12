// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validator } from "@carbon/form";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HStack
} from "@carbon/react";
import { getPayPeriodContaining, shiftPayPeriod } from "@carbon/timeclock";
import { datetime, redirect } from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { LuChevronLeft, LuChevronRight, LuPlay } from "react-icons/lu";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Link,
  useLoaderData,
  useParams,
  useSearchParams
} from "react-router";
import { DateTime } from "~/components";
import {
  clockIn,
  clockInValidator,
  clockOut,
  clockOutValidator,
  createTimeCardPunch,
  createTimeCardPunchValidator,
  deleteTimeCardPunch,
  deleteTimeCardPunchValidator,
  getOpenClockEntry,
  getTimeCardPunches,
  updateTimeCardPunch,
  updateTimeCardPunchValidator
} from "~/modules/people";
import { periodBoundsToInstants } from "~/modules/people/ui/Timecards/buildPunchGrid";
import TimecardPunchGrid from "~/modules/people/ui/Timecards/TimecardPunchGrid";
import { getCompanySettings } from "~/modules/settings";
import { getCompanyTimeZone } from "~/modules/shared/timezone.server";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "people"
  });

  const { personId } = params;
  if (!personId) throw new Error("Could not find personId");

  const companySettings = await getCompanySettings(client, companyId);
  if (!companySettings.data?.timeCardEnabled) {
    throw redirect(path.to.personDetails(personId));
  }

  const url = new URL(request.url);
  const periodOffset = Number.parseInt(
    url.searchParams.get("period") ?? "0",
    10
  );
  const tz = await getCompanyTimeZone(client, companyId);
  const todayYmd = datetime.today(tz).toString();
  const length = companySettings.data.payPeriodLengthDays === 14 ? 14 : 7;
  const base = getPayPeriodContaining(todayYmd, {
    payPeriodLengthDays: length,
    payPeriodAnchorDate: companySettings.data.payPeriodAnchorDate
  });
  const period = shiftPayPeriod(base, periodOffset, length);
  const { from, to } = periodBoundsToInstants(period.start, period.end, tz);

  const [punches, openEntry] = await Promise.all([
    getTimeCardPunches(client, companyId, {
      employeeId: personId,
      startIso: from,
      endIso: to
    }),
    getOpenClockEntry(client, personId, companyId)
  ]);

  if (punches.error) {
    throw redirect(
      path.to.personDetails(personId),
      await flash(
        request,
        error(punches.error, "Failed to load timecard punches")
      )
    );
  }

  return {
    punches: punches.data ?? [],
    openEntry: openEntry.data,
    period,
    periodOffset,
    tz
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "people"
  });

  const { personId } = params;
  if (!personId) throw new Error("No person ID provided");

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "clockIn") {
    const validation = await validator(clockInValidator).validate(formData);
    if (validation.error) return data({}, { status: 400 });
    const employeeId = validation.data.employeeId || personId;
    const result = await clockIn(client, {
      employeeId,
      companyId,
      createdBy: userId
    });
    if (result.error) {
      return data(
        {},
        await flash(request, error(result.error, "Failed to clock in"))
      );
    }
    return data({}, await flash(request, success("Clocked in")));
  }

  if (intent === "clockOut") {
    const validation = await validator(clockOutValidator).validate(formData);
    if (validation.error) return data({}, { status: 400 });
    const employeeId = validation.data.employeeId || personId;
    const result = await clockOut(client, {
      employeeId,
      companyId,
      updatedBy: userId,
      note: validation.data.note
    });
    if (result.error) {
      return data(
        {},
        await flash(request, error(result.error, "Failed to clock out"))
      );
    }
    return data({}, await flash(request, success("Clocked out")));
  }

  if (intent === "createPunch") {
    const validation = await validator(createTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) return data({}, { status: 400 });
    const result = await createTimeCardPunch(client, {
      companyId,
      employeeId: validation.data.employeeId || personId,
      punchedAt: new Date(validation.data.punchedAt).toISOString(),
      note: validation.data.note ?? null,
      source: "manual",
      createdBy: userId
    });
    if (result.error) {
      return data(
        {},
        await flash(request, error(result.error, "Failed to add punch"))
      );
    }
    return data({}, await flash(request, success("Punch added")));
  }

  if (intent === "updatePunch") {
    const validation = await validator(updateTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) return data({}, { status: 400 });
    const result = await updateTimeCardPunch(client, {
      companyId,
      id: validation.data.punchId,
      punchedAt: new Date(validation.data.punchedAt).toISOString(),
      note: validation.data.note ?? null,
      updatedBy: userId
    });
    if (result.error) {
      return data(
        {},
        await flash(request, error(result.error, "Failed to update punch"))
      );
    }
    return data({}, await flash(request, success("Punch updated")));
  }

  if (intent === "deletePunch") {
    const validation = await validator(deleteTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) return data({}, { status: 400 });
    const result = await deleteTimeCardPunch(client, {
      companyId,
      id: validation.data.punchId,
      actorUserId: userId
    });
    if (result.error) {
      return data(
        {},
        await flash(request, error(result.error, "Failed to delete punch"))
      );
    }
    return data({}, await flash(request, success("Punch deleted")));
  }

  return data({}, { status: 400 });
}

export default function PersonTimecardRoute() {
  const { punches, openEntry, period, periodOffset, tz } =
    useLoaderData<typeof loader>();
  const { personId } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useLingui();

  const periodLink = (offset: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", String(offset));
    return `${path.to.personTimecard(personId!)}?${params.toString()}`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <HStack className="justify-between items-center">
          <CardTitle>
            <Trans>Timecards</Trans>
          </CardTitle>
          <HStack>
            {openEntry ? (
              <form method="post">
                <input type="hidden" name="intent" value="clockOut" />
                <Button variant="destructive" type="submit">
                  <Trans>Clock Out</Trans>
                </Button>
              </form>
            ) : (
              <form method="post">
                <input type="hidden" name="intent" value="clockIn" />
                <Button leftIcon={<LuPlay />} type="submit">
                  <Trans>Clock In</Trans>
                </Button>
              </form>
            )}
          </HStack>
        </HStack>
        {openEntry ? (
          <Badge variant="green" className="w-fit">
            <Trans>
              Clocked in since{" "}
              <DateTime value={openEntry.clockIn} variant="time" />
            </Trans>
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <HStack className="justify-between items-center">
          <Button
            aria-label={t`Previous pay period`}
            leftIcon={<LuChevronLeft />}
            variant="secondary"
            asChild
          >
            <Link to={periodLink(periodOffset - 1)}>
              <Trans>Prev</Trans>
            </Link>
          </Button>
          <span className="text-sm tabular-nums">
            {period.start} → {period.end}
          </span>
          <Button
            aria-label={t`Next pay period`}
            rightIcon={<LuChevronRight />}
            variant="secondary"
            asChild
          >
            <Link to={periodLink(periodOffset + 1)}>
              <Trans>Next</Trans>
            </Link>
          </Button>
        </HStack>

        <TimecardPunchGrid
          punches={punches.map((p) => ({
            id: p.id,
            punchedAt: p.punchedAt,
            source: p.source,
            note: p.note
          }))}
          periodStart={period.start}
          periodEnd={period.end}
          tz={tz}
          businessDay={datetime.businessDay}
          employeeId={personId!}
          canEdit
        />
      </CardContent>
    </Card>
  );
}
