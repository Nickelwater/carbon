// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  Button,
  HStack,
  IconButton,
  Input,
  Table as TableBase,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLocale } from "@react-aria/i18n";
import { Fragment, useState } from "react";
import { LuPencil, LuPlus, LuTrash } from "react-icons/lu";
import { useFetcher } from "react-router";
import { usePermissions } from "~/hooks";
import {
  buildPunchGrid,
  formatDurationMs,
  type GridPunch
} from "./buildPunchGrid";

type TimecardPunchGridProps = {
  punches: GridPunch[];
  periodStart: string;
  periodEnd: string;
  tz: string;
  businessDay: (instant: string, tz: string) => { toString(): string };
  employeeId: string;
  canEdit: boolean;
};

function formatPunchTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function toLocalDatetimeInput(dateStr: string) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function PunchCell({
  punch,
  locale,
  canEdit,
  onEdit,
  onDelete,
  missing = false
}: {
  punch: GridPunch | null;
  locale: string;
  canEdit: boolean;
  onEdit: (punch: GridPunch) => void;
  onDelete: (punchId: string) => void;
  missing?: boolean;
}) {
  if (!punch) {
    return (
      <Td
        className={
          missing
            ? "bg-destructive/10 text-muted-foreground text-center"
            : "text-muted-foreground text-center"
        }
      >
        —
      </Td>
    );
  }
  const isManual = punch.source === "manual";
  return (
    <Td>
      <HStack className="justify-between gap-1">
        <span className={isManual ? "font-bold" : undefined}>
          {formatPunchTime(punch.punchedAt, locale)}
        </span>
        {canEdit ? (
          <HStack spacing={0}>
            <IconButton
              aria-label="Edit punch"
              icon={<LuPencil />}
              size="sm"
              variant="ghost"
              onClick={() => onEdit(punch)}
            />
            <IconButton
              aria-label="Delete punch"
              icon={<LuTrash />}
              size="sm"
              variant="ghost"
              onClick={() => onDelete(punch.id)}
            />
          </HStack>
        ) : null}
      </HStack>
    </Td>
  );
}

const TimecardPunchGrid = ({
  punches,
  periodStart,
  periodEnd,
  tz,
  businessDay,
  employeeId,
  canEdit
}: TimecardPunchGridProps) => {
  const { t } = useLingui();
  const { locale } = useLocale();
  const permissions = usePermissions();
  const fetcher = useFetcher();
  const editable = canEdit && permissions.can("update", "people");

  const { days, maxPairs } = buildPunchGrid({
    punches,
    periodStart,
    periodEnd,
    tz,
    businessDay
  });

  const [editing, setEditing] = useState<GridPunch | null>(null);
  const [adding, setAdding] = useState(false);

  const deletePunch = (punchId: string) => {
    const fd = new FormData();
    fd.set("intent", "deletePunch");
    fd.set("punchId", punchId);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {editable ? (
        <HStack>
          <Button
            leftIcon={<LuPlus />}
            variant="secondary"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
          >
            <Trans>Insert punch</Trans>
          </Button>
        </HStack>
      ) : null}

      {(adding || editing) && editable ? (
        <fetcher.Form
          method="post"
          className="flex flex-wrap items-end gap-3 border border-border rounded-md p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fd = new FormData(form);
            const local = String(fd.get("punchedAt") ?? "");
            if (local) {
              fd.set("punchedAt", new Date(local).toISOString());
            }
            fetcher.submit(fd, { method: "post" });
            setAdding(false);
            setEditing(null);
          }}
        >
          <input
            type="hidden"
            name="intent"
            value={editing ? "updatePunch" : "createPunch"}
          />
          <input type="hidden" name="employeeId" value={employeeId} />
          {editing ? (
            <input type="hidden" name="punchId" value={editing.id} />
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span>{t`Punch time`}</span>
            <Input
              type="datetime-local"
              name="punchedAt"
              required
              defaultValue={
                editing
                  ? toLocalDatetimeInput(editing.punchedAt)
                  : toLocalDatetimeInput(new Date().toISOString())
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t`Note`}</span>
            <Input
              name="note"
              defaultValue={editing?.note ?? ""}
              placeholder={t`Optional`}
            />
          </label>
          <Button type="submit">
            {editing ? <Trans>Save punch</Trans> : <Trans>Add punch</Trans>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setEditing(null);
            }}
          >
            <Trans>Cancel</Trans>
          </Button>
        </fetcher.Form>
      ) : null}

      <div className="overflow-auto border border-border rounded-md">
        <TableBase>
          <Thead>
            <Tr>
              <Th>
                <Trans>Date</Trans>
              </Th>
              {Array.from({ length: maxPairs }, (_, i) => (
                <Fragment key={`hdr-${i}`}>
                  <Th>
                    <Trans>In</Trans>
                    {maxPairs > 1 ? ` ${i + 1}` : ""}
                  </Th>
                  <Th>
                    <Trans>Out</Trans>
                    {maxPairs > 1 ? ` ${i + 1}` : ""}
                  </Th>
                </Fragment>
              ))}
              <Th>
                <Trans>Day total</Trans>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {days.map((day) => (
              <Tr key={day.date}>
                <Td className="whitespace-nowrap font-medium">
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString(locale, {
                    weekday: "short",
                    month: "short",
                    day: "numeric"
                  })}
                </Td>
                {Array.from({ length: maxPairs }, (_, i) => {
                  const pair = day.pairs[i] ?? {
                    clockIn: null,
                    clockOut: null
                  };
                  return (
                    <Fragment key={`${day.date}-pair-${i}`}>
                      <PunchCell
                        punch={pair.clockIn}
                        locale={locale}
                        canEdit={editable}
                        onEdit={setEditing}
                        onDelete={deletePunch}
                      />
                      <PunchCell
                        punch={pair.clockOut}
                        locale={locale}
                        canEdit={editable}
                        onEdit={setEditing}
                        onDelete={deletePunch}
                        missing={!!pair.clockIn && !pair.clockOut}
                      />
                    </Fragment>
                  );
                })}
                <Td className="tabular-nums">
                  {formatDurationMs(day.dayTotalMs)}
                </Td>
              </Tr>
            ))}
          </Tbody>{" "}
        </TableBase>
      </div>
    </div>
  );
};

export default TimecardPunchGrid;
