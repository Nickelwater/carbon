import { LuHardHat, LuList, LuStickyNote, LuUser } from "react-icons/lu";
import type { PublicAttributes } from "~/modules/account";

export function usePersonSidebar(attributeCategories: PublicAttributes[]) {
  const baseLinks = [
    {
      name: "Profile",
      to: "details",
      icon: <LuUser />,
    },
    {
      name: "Job",
      to: "job",
      icon: <LuHardHat />,
    },
    {
      name: "Notes",
      to: "notes",
      icon: <LuStickyNote />,
    },
  ];

  const categoryLinks = attributeCategories.map((category) => ({
    name: category.name ?? "Attributes",
    to: `attributes/${category.id}`,
    icon: category.emoji ? (
      <span className="text-base">{category.emoji}</span>
    ) : (
      <LuList />
    ),
  }));

  return [...baseLinks, ...categoryLinks];
}
