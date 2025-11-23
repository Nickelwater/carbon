import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuIcon,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@carbon/react";
import { useLocation, useNavigate } from "@remix-run/react";
import {
  LuCalendar,
  LuCalendarDays,
  LuChevronDown,
  LuList,
} from "react-icons/lu";
import { path } from "~/utils/path";

export function ScheduleNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const getCurrentView = () => {
    if (location.pathname.includes(path.to.scheduleOperation))
      return "operations";
    if (location.pathname.includes(path.to.scheduleDates)) {
      if (location.search.includes("view=month")) {
        return "month";
      }
      // Default to week for scheduleDates path (whether view=week or no view param)
      return "week";
    }
    return "operations";
  };

  const currentValue = getCurrentView();

  const getViewLabel = (option: string) => {
    switch (option) {
      case "operations":
        return "Operations";
      case "week":
        return "Week";
      case "month":
        return "Month";
      default:
        return "";
    }
  };

  const getViewIcon = (option: string) => {
    switch (option) {
      case "operations":
        return <LuList />;
      case "week":
        return <LuCalendarDays />;
      case "month":
        return <LuCalendar />;
      default:
        return <LuList />;
    }
  };

  const navigateToView = (view: string) => {
    const searchParams = new URLSearchParams(location.search);

    switch (view) {
      case "operations":
        navigate(path.to.scheduleOperation + "?" + searchParams.toString());
        break;
      case "week":
        searchParams.set("view", "week");
        navigate(path.to.scheduleDates + "?" + searchParams.toString());
        break;
      case "month":
        searchParams.set("view", "month");
        navigate(path.to.scheduleDates + "?" + searchParams.toString());
        break;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          leftIcon={getViewIcon(currentValue)}
          rightIcon={<LuChevronDown />}
          variant="secondary"
        >
          {getViewLabel(currentValue)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuRadioGroup
          value={currentValue}
          onValueChange={navigateToView}
        >
          <DropdownMenuRadioItem value="operations">
            <DropdownMenuIcon icon={getViewIcon("operations")} />
            {getViewLabel("operations")}
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Jobs</DropdownMenuLabel>
            <DropdownMenuRadioItem value="week">
              <DropdownMenuIcon icon={getViewIcon("week")} />
              {getViewLabel("week")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="month">
              <DropdownMenuIcon icon={getViewIcon("month")} />
              {getViewLabel("month")}
            </DropdownMenuRadioItem>
          </DropdownMenuGroup>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
