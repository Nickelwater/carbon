import type { PublicAttributes } from "~/modules/account";
import { DetailSidebar } from "~/components/Layout";
import { usePersonSidebar } from "./usePersonSidebar";

type PersonSidebarProps = {
  attributeCategories: PublicAttributes[];
};

const PersonSidebar = ({ attributeCategories }: PersonSidebarProps) => {
  const links = usePersonSidebar(attributeCategories);

  return <DetailSidebar links={links} />;
};

export default PersonSidebar;
