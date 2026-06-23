import type { AvatarProps } from "@carbon/react";
import { HStack } from "@carbon/react";
import { getFaviconUrl, isUrl } from "@carbon/utils";
import { useCustomers } from "~/stores";
import Avatar from "./Avatar";

type CustomerAvatarProps = AvatarProps & {
  customerId: string | null;
  className?: string;
  name?: string | null;
  website?: string | null;
};

const CustomerAvatar = ({
  customerId,
  name: nameProp,
  website: websiteProp,
  size,
  className,
  ...props
}: CustomerAvatarProps) => {
  const [customers] = useCustomers();

  if (!customerId) return null;

  const fromStore = customers.find((s) => s.id === customerId);
  const customer = {
    id: customerId,
    name: nameProp ?? fromStore?.name ?? "",
    website: websiteProp ?? fromStore?.website ?? null
  };

  const imageUrl =
    customer.website && isUrl(customer.website)
      ? getFaviconUrl(customer.website)
      : undefined;

  return (
    <HStack className="truncate no-underline hover:no-underline">
      <Avatar
        size={size ?? "xs"}
        {...props}
        name={customer?.name ?? ""}
        imageUrl={imageUrl}
      />
      <span className={className}>{customer.name}</span>
    </HStack>
  );
};

export default CustomerAvatar;
