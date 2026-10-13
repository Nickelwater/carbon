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
  type GridPunch,
  PAIRS_PER_ROW
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

/** YYYY-MM-DD → datetime-local default (noon local) for inserting on that day. */
function dateToDatetimeLocalDefault(ymd: string): string {
  return `${ymd.slice(0, 10)}T12:00`;
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

  const { rows } = buildPunchGrid({
    punches,
    periodStart,
    periodEnd,
    tz,
    businessDay
  });

  const [editing, setEditing] = useState<GridPunch | null>(null);
  const [adding, setAdding] = useState(false);
  /** When set, insert form defaults to noon on this YYYY-MM-DD. */
  const [addingDate, setAddingDate] = useState<string | null>(null);

  const openInsert = (ymd?: string) => {
    setEditing(null);
    setAddingDate(ymd ?? null);
    setAdding(true);
  };

  const closeForm = () => {
    setAdding(false);
    setAddingDate(null);
    setEditing(null);
  };

  const deletePunch = (punchId: string) => {
    const fd = new FormData();
    fd.set("intent", "deletePunch");
    fd.set("punchId", punchId);
    fetcher.submit(fd, { method: "post" });
  };

  const insertDefault =
    addingDate != null
      ? dateToDatetimeLocalDefault(addingDate)
      : toLocalDatetimeInput(new Date().toISOString());

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {editable ? (
        <HStack>
          <Button
            leftIcon={<LuPlus />}
            variant="secondary"
            onClick={() => openInsert()}
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
            closeForm();
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
              key={
                editing ? `edit-${editing.id}` : `add-${addingDate ?? "now"}`
              }
              type="datetime-local"
              name="punchedAt"
              required
              defaultValue={
                editing
                  ? toLocalDatetimeInput(editing.punchedAt)
                  : insertDefault
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
          <Button type="button" variant="ghost" onClick={closeForm}>
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
              {Array.from({ length: PAIRS_PER_ROW }, (_, i) => (
                <Fragment key={`hdr-${i}`}>
                  <Th>
                    <Trans>In</Trans> {i + 1}
                  </Th>
                  <Th>
                    <Trans>Out</Trans> {i + 1}
                  </Th>
                </Fragment>
              ))}
              <Th>
                <Trans>Day total</Trans>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row, rowIndex) => (
              <Tr key={`${row.date}-${rowIndex}`}>
                <Td className="whitespace-nowrap font-medium">
                  {row.isPrimary ? (
                    editable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:underline text-left"
                        title={t`Insert punch`}
                        onClick={() => openInsert(row.date)}
                      >
                        <span>
                          {new Date(`${row.date}T12:00:00`).toLocaleDateString(
                            locale,
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric"
                            }
                          )}
                        </span>
                        {row.hasPunchError ? (
                          <span
                            className="text-destructive font-bold"
                            title={t`Missing punch`}
                          >
                            !
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <HStack className="gap-1">
                        <span>
                          {new Date(`${row.date}T12:00:00`).toLocaleDateString(
                            locale,
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric"
                            }
                          )}
                        </span>
                        {row.hasPunchError ? (
                          <span
                            className="text-destructive font-bold"
                            title={t`Missing punch`}
                          >
                            !
                          </span>
                        ) : null}
                      </HStack>
                    )
                  ) : null}
                </Td>
                {row.pairs.map((pair, i) => (
                  <Fragment key={`${row.date}-${rowIndex}-pair-${i}`}>
                    <PunchCell
                      punch={pair.clockIn}
                      locale={locale}
                      canEdit={editable}
                      onEdit={(punch) => {
                        setAdding(false);
                        setAddingDate(null);
                        setEditing(punch);
                      }}
                      onDelete={deletePunch}
                    />
                    <PunchCell
                      punch={pair.clockOut}
                      locale={locale}
                      canEdit={editable}
                      onEdit={(punch) => {
                        setAdding(false);
                        setAddingDate(null);
                        setEditing(punch);
                      }}
                      onDelete={deletePunch}
                      missing={!!pair.clockIn && !pair.clockOut}
                    />
                  </Fragment>
                ))}
                <Td className="tabular-nums">
                  {row.dayTotalMs == null
                    ? null
                    : formatDurationMs(row.dayTotalMs)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </TableBase>
      </div>
    </div>
  );
};

export default TimecardPunchGrid;
