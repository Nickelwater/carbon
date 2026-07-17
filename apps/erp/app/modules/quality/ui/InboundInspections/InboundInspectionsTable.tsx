import { Badge } from "@carbon/react";
import { getItemReadableId } from "@carbon/utils";
import { useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useMemo } from "react";
import {
  LuBlocks,
  LuBookMarked,
  LuCalendar,
  LuClipboardCheck,
  LuHash,
  LuTruck
} from "react-icons/lu";
import { EmployeeAvatar, Hyperlink, Table } from "~/components";
import { useDateFormatter, useUrlParams } from "~/hooks";
import { inboundInspectionStatus } from "~/modules/quality/quality.models";
import type { InboundInspection } from "~/modules/quality/types";
import { useItems } from "~/stores/items";
import { path } from "~/utils/path";

export type InspectionListVariant = "inbound" | "lot";

type InboundInspectionsTableProps = {
  data: InboundInspection[];
  count: number;
  variant?: InspectionListVariant;
};

function getStatusVariant(status: string) {
  if (status === "Passed") return "green";
  if (status === "Failed") return "red";
  if (status === "Partial") return "yellow";
  if (status === "In Progress") return "blue";
  return "secondary";
}

function computeProgress(row: InboundInspection): {
  inspected: number;
  total: number;
} {
  const samples: { status: string }[] =
    ((row as any).inboundInspectionSample as { status: string }[]) ?? [];
  const inspected = samples.filter((s) => s.status !== "Pending").length;
  return { inspected, total: (row as any).sampleSize ?? 0 };
}

const InboundInspectionsTable = memo(
  ({ data, count, variant = "inbound" }: InboundInspectionsTableProps) => {
    const { t } = useLingui();
    const { formatDate } = useDateFormatter();
    const [params] = useUrlParams();
    const [items] = useItems();
    const isLot = variant === "lot";
    const detailPath = isLot
      ? path.to.lotInspection
      : path.to.inboundInspection;
    const title = isLot ? t`Lot Inspections` : t`Inbound Inspections`;
    const byHeader = isLot ? t`Produced By` : t`Received By`;
    const atHeader = isLot ? t`Produced At` : t`Received At`;
    const savedViewTable = isLot ? "lotInspection" : "inboundInspection";

    const columns = useMemo<ColumnDef<InboundInspection>[]>(() => {
      return [
        {
          accessorKey: "inboundInspectionId",
          header: t`Inspection`,
          cell: ({ row }) => (
            <Hyperlink
              to={`${detailPath(row.original.id!)}?${params.toString()}`}
            >
              {(row.original as any).inboundInspectionId}
            </Hyperlink>
          ),
          meta: {
            icon: <LuBookMarked />
          }
        },
        {
          accessorKey: "itemId",
          header: t`Item`,
          cell: ({ row }) => (
            <div className="flex flex-col gap-0">
              <span className="text-sm font-medium">
                {getItemReadableId(items, (row.original as any).itemId) ??
                  (row.original as any).itemReadableId ??
                  ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {(row.original as any).item?.name}
              </span>
            </div>
          ),
          meta: {
            icon: <LuBookMarked />,
            filter: {
              type: "static",
              options: items.map((item) => ({
                value: item.id,
                label: item.readableIdWithRevision
              }))
            }
          }
        },
        {
          id: "source",
          header: isLot ? t`Job` : t`Source`,
          cell: ({ row }) => {
            if (isLot) {
              return (
                <span className="text-sm">
                  {(row.original as any).job?.jobId ?? ""}
                </span>
              );
            }
            return (
              <div className="flex flex-col gap-0 text-sm">
                <span>{(row.original as any).receipt?.receiptId}</span>
                <span className="text-xs text-muted-foreground">
                  {(row.original as any).supplier?.name}
                </span>
              </div>
            );
          },
          meta: {
            icon: <LuTruck />,
            exportValue: (row) => {
              if (isLot) {
                return (row as any).job?.jobId ?? null;
              }
              return (row as any).receipt?.receiptId ?? null;
            }
          }
        },
        {
          accessorKey: "lotSize",
          header: t`Lot Size`,
          cell: ({ row }) => (
            <span className="text-sm">
              {(row.original as any).lotSize ?? 0}
            </span>
          ),
          meta: { icon: <LuBlocks /> }
        },
        {
          accessorKey: "sampleSize",
          header: t`Sample`,
          cell: ({ row }) => {
            const p = computeProgress(row.original);
            return (
              <span className="text-sm">
                {p.inspected} / {p.total}
              </span>
            );
          },
          meta: { icon: <LuHash /> }
        },
        {
          accessorKey: "status",
          header: t`Status`,
          cell: ({ row }) => (
            <Badge variant={getStatusVariant(row.original.status)}>
              {row.original.status}
            </Badge>
          ),
          meta: {
            icon: <LuClipboardCheck />,
            filter: {
              type: "static",
              options: inboundInspectionStatus.map((s) => ({
                value: s,
                label: <Badge variant={getStatusVariant(s)}>{s}</Badge>
              }))
            }
          }
        },
        {
          accessorKey: "createdBy",
          header: byHeader,
          cell: ({ row }) => (
            <EmployeeAvatar employeeId={row.original.createdBy} />
          ),
          meta: { icon: <LuBlocks /> }
        },
        {
          accessorKey: "createdAt",
          header: atHeader,
          cell: ({ row }) =>
            row.original.createdAt ? formatDate(row.original.createdAt) : "",
          meta: { icon: <LuCalendar /> }
        }
      ];
    }, [items, t, params, formatDate, detailPath, isLot, byHeader, atHeader]);

    return (
      <Table<InboundInspection>
        data={data}
        columns={columns}
        count={count ?? 0}
        title={title}
        table={savedViewTable}
        withSavedView
      />
    );
  }
);

InboundInspectionsTable.displayName = "InboundInspectionsTable";
export default InboundInspectionsTable;
