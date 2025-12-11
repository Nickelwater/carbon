import "@tanstack/react-table";
import type { ReactElement } from "react";
import type { ColumnFilterData } from "./components/Filter/types";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends unknown, TValue> {
    filter?: ColumnFilterData;
    pluralHeader?: string;
    icon?: ReactElement;
    renderTotal?: boolean;
    formatter?: (
      val:
        | number
        | bigint
        | `${number}`
        | "Infinity"
        | "-Infinity"
        | "+Infinity"
    ) => string;
  }
}

export type ColumnSizeMap = Map<string, { width: number; startX: number }>;
