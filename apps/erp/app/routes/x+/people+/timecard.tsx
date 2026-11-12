// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validator } from "@carbon/form";
import { Button, HStack, IconButton, Input, VStack } from "@carbon/react";
import { getPayPeriodContaining, shiftPayPeriod } from "@carbon/timeclock";
import { datetime, isUnaffectedByNavigation, redirect } from "@carbon/utils";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunction
} from "react-router";
import {
  data,
  Outlet,
  useLoaderData,
  useNavigate,
  useSearchParams
} from "react-router";
import {
  createTimeCardPunch,
  createTimeCardPunchValidator,
  deleteTimeCardPunch,
  deleteTimeCardPunchValidator,
  getTimeCardPunches,
  updateTimeCardPunch,
  updateTimeCardPunchValidator
} from "~/modules/people";
import { periodBoundsToInstants } from "~/modules/people/ui/Timecards/buildPunchGrid";
import TimecardPunchGrid from "~/modules/people/ui/Timecards/TimecardPunchGrid";
import { getCompanySettings } from "~/modules/settings";
import { getCompanyTimeZone } from "~/modules/shared/timezone.server";
import { getEmployees } from "~/modules/users/users.service";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: msg`Timecards`,
  to: path.to.peopleTimecard
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

  const url = new URL(request.url);
  const periodOffset = Number.parseInt(
    url.searchParams.get("period") ?? "0",
    10
  );
  const employeeId = url.searchParams.get("employeeId");
  const search = url.searchParams.get("q") ?? "";

  const tz = await getCompanyTimeZone(client, companyId);
  const todayYmd = datetime.today(tz).toString();
  const length = companySettings.data.payPeriodLengthDays === 14 ? 14 : 7;
  const base = getPayPeriodContaining(todayYmd, {
    payPeriodLengthDays: length,
    payPeriodAnchorDate: companySettings.data.payPeriodAnchorDate
  });
  const period = shiftPayPeriod(base, periodOffset, length);
  const { from, to } = periodBoundsToInstants(period.start, period.end, tz);

  const employees = await getEmployees(client, companyId, {
    search: search || null,
    limit: 200,
    offset: 0
  });

  const list = (employees.data ?? []).filter(
    (e): e is typeof e & { id: string } => typeof e.id === "string" && !!e.id
  );
  const selectedId =
    employeeId && list.some((e) => e.id === employeeId)
      ? employeeId
      : (list[0]?.id ?? null);

  const punches = selectedId
    ? await getTimeCardPunches(client, companyId, {
        employeeId: selectedId,
        startIso: from,
        endIso: to
      })
    : { data: [], error: null };

  if (punches.error) {
    throw redirect(
      path.to.people,
      await flash(
        request,
        error(punches.error, "Failed to load timecard punches")
      )
    );
  }

  return {
    employees: list,
    selectedEmployeeId: selectedId,
    punches: punches.data ?? [],
    period,
    periodOffset,
    search,
    tz,
    payPeriodLengthDays: length
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "people"
  });

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "createPunch") {
    const validation = await validator(createTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) {
      return data(
        { success: false },
        await flash(request, error(validation.error, "Invalid punch"))
      );
    }
    const result = await createTimeCardPunch(client, {
      companyId,
      employeeId: validation.data.employeeId,
      punchedAt: new Date(validation.data.punchedAt).toISOString(),
      note: validation.data.note ?? null,
      source: "manual",
      createdBy: userId
    });
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to add punch"))
      );
    }
    return data(
      { success: true },
      await flash(request, success("Punch added"))
    );
  }

  if (intent === "updatePunch") {
    const validation = await validator(updateTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) {
      return data(
        { success: false },
        await flash(request, error(validation.error, "Invalid punch"))
      );
    }
    const result = await updateTimeCardPunch(client, {
      companyId,
      id: validation.data.punchId,
      punchedAt: new Date(validation.data.punchedAt).toISOString(),
      note: validation.data.note ?? null,
      updatedBy: userId
    });
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to update punch"))
      );
    }
    return data(
      { success: true },
      await flash(request, success("Punch updated"))
    );
  }

  if (intent === "deletePunch") {
    const validation = await validator(deleteTimeCardPunchValidator).validate(
      formData
    );
    if (validation.error) {
      return data(
        { success: false },
        await flash(request, error(validation.error, "Invalid punch"))
      );
    }
    const result = await deleteTimeCardPunch(client, {
      companyId,
      id: validation.data.punchId,
      actorUserId: userId
    });
    if (result.error) {
      return data(
        { success: false },
        await flash(request, error(result.error, "Failed to delete punch"))
      );
    }
    return data(
      { success: true },
      await flash(request, success("Punch deleted"))
    );
  }

  return data(
    { success: false },
    await flash(request, error(null, "Unknown action"))
  );
}

export default function TimecardsRoute() {
  const {
    employees,
    selectedEmployeeId,
    punches,
    period,
    periodOffset,
    search,
    tz
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [query, setQuery] = useState(search);

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  const setPeriod = (next: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", String(next));
    setSearchParams(params);
  };

  const selectEmployee = (id: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("employeeId", id);
    setSearchParams(params);
  };

  return (
    <VStack spacing={0} className="h-full">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <HStack>
          <IconButton
            aria-label={t`Previous pay period`}
            icon={<LuChevronLeft />}
            variant="secondary"
            onClick={() => setPeriod(periodOffset - 1)}
          />
          <span className="text-sm font-medium tabular-nums">
            {period.start} → {period.end}
          </span>
          <IconButton
            aria-label={t`Next pay period`}
            icon={<LuChevronRight />}
            variant="secondary"
            onClick={() => setPeriod(periodOffset + 1)}
          />
          {periodOffset !== 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setPeriod(0)}>
              <Trans>Current</Trans>
            </Button>
          ) : null}
        </HStack>
      </div>

      <div className="grid grid-cols-[240px_minmax(0,1fr)] h-[calc(100%-3.25rem)] min-h-0">
        <aside className="border-r border-border overflow-y-auto p-2 space-y-2">
          <Input
            value={query}
            placeholder={t`Search employees`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const params = new URLSearchParams(searchParams);
                if (query) params.set("q", query);
                else params.delete("q");
                setSearchParams(params);
              }
            }}
          />
          <ul className="space-y-0.5">
            {employees
              .filter((e) =>
                query
                  ? (e.name ?? "").toLowerCase().includes(query.toLowerCase())
                  : true
              )
              .filter(
                (employee): employee is typeof employee & { id: string } =>
                  !!employee.id
              )
              .map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    className={`w-full text-left rounded-md px-2 py-1.5 text-sm ${
                      employee.id === selectedEmployeeId
                        ? "bg-active text-active-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => selectEmployee(employee.id)}
                  >
                    {employee.name}
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        <main className="min-h-0 overflow-hidden p-4 flex flex-col gap-3">
          {selectedEmployeeId && selected ? (
            <>
              <HStack className="justify-between">
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(path.to.personTimecard(selectedEmployeeId))
                  }
                >
                  <Trans>Open person page</Trans>
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
                employeeId={selectedEmployeeId}
                canEdit
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>No employees found.</Trans>
            </p>
          )}
        </main>
      </div>
      <Outlet />
    </VStack>
  );
}
