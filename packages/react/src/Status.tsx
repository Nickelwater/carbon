import type { ComponentProps } from "react";
import { Badge } from "./Badge";
import { cn } from "./utils/cn";
import {
  LuCircleCheck,
  LuCircleAlert,
  LuCircleSlash,
  LuClock,
  LuLoaderCircle,
  LuStar,
  LuCircleDashed,
} from "react-icons/lu";
type StatusProps = ComponentProps<"div"> & {
  color?: "green" | "orange" | "red" | "yellow" | "blue" | "gray" | "purple";
};

const getStatusIcon = (color: string) => {
  switch (color) {
    case "green":
      return <LuCircleCheck />;
    case "orange":
      return <LuCircleAlert />;
    case "red":
      return <LuCircleSlash />;
    case "yellow":
      return <LuClock />;
    case "blue":
      return <LuLoaderCircle />;
    case "purple":
      return <LuStar />;
    case "gray":
    default:
      return <LuCircleDashed />;
  }
};

const Status = ({
  color = "gray",
  children,
  className,
  ...props
}: StatusProps) => {
  return (
    <Badge
      variant={color}
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    >
      {getStatusIcon(color)}
      {children}
    </Badge>
  );
};

export { Status };
