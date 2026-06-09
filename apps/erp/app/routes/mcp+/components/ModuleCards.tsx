import { cn } from "@carbon/react";
import type { IconType } from "react-icons";
import { LuLayoutGrid } from "react-icons/lu";
import type { CatalogModule } from "../catalog.server";
import { FALLBACK_MODULE_ICON, MODULE_ICONS } from "./module-icons";

function Card({
  icon: Icon,
  label,
  count,
  active,
  onClick
}: {
  icon: IconType;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-[9px] text-left p-[10px] rounded-lg border cursor-pointer transition-[border-color,background,transform] duration-150 active:scale-[0.97]",
        active
          ? "border-[var(--acc)] bg-[var(--acc-tint)]"
          : "border-border bg-card hover:border-muted-foreground"
      )}
    >
      <Icon
        size={16}
        className={cn(
          "shrink-0",
          active ? "text-[var(--acc)]" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0">
        <span className="block font-medium text-[0.8rem] text-foreground truncate">
          {label}
        </span>
        <span className="block font-[var(--mono)] text-[0.62rem] text-muted-foreground tabular-nums">
          {count.toLocaleString()}
        </span>
      </span>
    </button>
  );
}

export function ModuleCards({
  modules,
  total,
  value,
  onChange
}: {
  modules: CatalogModule[];
  total: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[8px] mb-[18px]">
      <Card
        icon={LuLayoutGrid}
        label="All modules"
        count={total}
        active={value === ""}
        onClick={() => onChange("")}
      />
      {modules.map((m) => (
        <Card
          key={m.key}
          icon={MODULE_ICONS[m.key] ?? FALLBACK_MODULE_ICON}
          label={m.label}
          count={m.count}
          active={value === m.key}
          onClick={() => onChange(value === m.key ? "" : m.key)}
        />
      ))}
    </div>
  );
}
