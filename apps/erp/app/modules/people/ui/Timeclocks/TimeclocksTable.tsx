// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  Badge,
  HStack,
  MenuIcon,
  MenuItem,
  useDisclosure
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useCallback, useMemo } from "react";
import {
  LuCheck,
  LuDownload,
  LuHistory,
  LuRadar,
  LuToggleLeft,
  LuToggleRight
} from "react-icons/lu";
import { useFetcher } from "react-router";
import { DateTime, Table } from "~/components";
import { usePermissions } from "~/hooks";

type TimeClockDevice = {
  id: string;
  serialNumber: string;
  name: string | null;
  enabled: boolean;
  autoPoll: boolean;
  pollIntervalSeconds: number;
  lastSeenAt: string | null;
  lastRegAt: string | null;
  firmware: string | null;
  modelName: string | null;
};

type TimeClockPunch = {
  id: string;
  enrollId: string;
  punchedAt: string;
  status: string;
  serialNumber: string;
  error: string | null;
};

type TimeclocksTableProps = {
  devices: TimeClockDevice[];
  unmappedPunches: TimeClockPunch[];
};

const TimeclocksTable = memo(
  ({ devices, unmappedPunches }: TimeclocksTableProps) => {
    const { t } = useLingui();
    const permissions = usePermissions();
    const fetcher = useFetcher();
    const punchesOpen = useDisclosure({ defaultIsOpen: true });

    const columns = useMemo<ColumnDef<TimeClockDevice>[]>(
      () => [
        {
          accessorKey: "serialNumber",
          header: t`Serial`,
          cell: ({ row }) => (
            <span className="font-mono text-sm">
              {row.original.serialNumber}
            </span>
          ),
          meta: { icon: <LuRadar /> }
        },
        {
          accessorKey: "name",
          header: t`Name`,
          cell: ({ row }) => row.original.name || "—"
        },
        {
          accessorKey: "enabled",
          header: t`Enabled`,
          cell: ({ row }) => (
            <Badge variant={row.original.enabled ? "green" : "secondary"}>
              {row.original.enabled ? t`Yes` : t`No`}
            </Badge>
          )
        },
        {
          accessorKey: "autoPoll",
          header: t`Auto-poll`,
          cell: ({ row }) =>
            row.original.autoPoll
              ? `${row.original.pollIntervalSeconds}s`
              : t`Off`
        },
        {
          accessorKey: "lastSeenAt",
          header: t`Last seen`,
          cell: ({ row }) => (
            <DateTime
              value={row.original.lastSeenAt}
              variant="datetime"
              fallback="—"
            />
          )
        }
      ],
      [t]
    );

    const renderContextMenu = useCallback(
      (row: TimeClockDevice) => {
        if (!permissions.can("update", "people")) return null;
        return (
          <>
            <MenuItem
              onClick={() =>
                fetcher.submit(
                  {
                    intent: "toggleEnabled",
                    id: row.id,
                    enabled: row.enabled ? "false" : "true"
                  },
                  { method: "post" }
                )
              }
            >
              <MenuIcon
                icon={row.enabled ? <LuToggleLeft /> : <LuToggleRight />}
              />
              {row.enabled ? <Trans>Disable</Trans> : <Trans>Enable</Trans>}
            </MenuItem>
            <MenuItem
              onClick={() =>
                fetcher.submit(
                  {
                    intent: "toggleAutoPoll",
                    id: row.id,
                    autoPoll: row.autoPoll ? "false" : "true"
                  },
                  { method: "post" }
                )
              }
            >
              <MenuIcon icon={<LuCheck />} />
              {row.autoPoll ? (
                <Trans>Disable auto-poll</Trans>
              ) : (
                <Trans>Enable auto-poll</Trans>
              )}
            </MenuItem>
            <MenuItem
              disabled={!row.enabled}
              onClick={() =>
                fetcher.submit(
                  { intent: "collect", id: row.id, sn: row.serialNumber },
                  { method: "post" }
                )
              }
            >
              <MenuIcon icon={<LuDownload />} />
              <Trans>Collect Now</Trans>
            </MenuItem>
            <MenuItem
              disabled={!row.enabled}
              onClick={() =>
                fetcher.submit(
                  { intent: "collectAll", id: row.id, sn: row.serialNumber },
                  { method: "post" }
                )
              }
            >
              <MenuIcon icon={<LuHistory />} />
              <Trans>Collect all punches</Trans>
            </MenuItem>
          </>
        );
      },
      [fetcher, permissions]
    );

    return (
      <div className="flex flex-col h-full">
        <Table<TimeClockDevice>
          data={devices}
          columns={columns}
          count={devices.length}
          withSearch={false}
          renderContextMenu={renderContextMenu}
        />
        {unmappedPunches.length > 0 && (
          <div className="border-t p-4 space-y-2">
            <button
              type="button"
              className="text-sm font-medium"
              onClick={punchesOpen.onToggle}
            >
              <Trans>Unmapped punches</Trans> ({unmappedPunches.length})
            </button>
            {punchesOpen.isOpen && (
              <ul className="space-y-2 text-sm">
                {unmappedPunches.map((punch) => (
                  <li key={punch.id}>
                    <HStack className="justify-between gap-4">
                      <span>
                        <span className="font-mono">{punch.enrollId}</span>
                        {" · "}
                        <DateTime value={punch.punchedAt} variant="datetime" />
                        {" · "}
                        {punch.serialNumber}
                      </span>
                      {permissions.can("update", "people") && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            fetcher.submit(
                              { intent: "reprocess", punchId: punch.id },
                              { method: "post" }
                            )
                          }
                        >
                          <Trans>Reprocess</Trans>
                        </button>
                      )}
                    </HStack>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
);

TimeclocksTable.displayName = "TimeclocksTable";
export default TimeclocksTable;
