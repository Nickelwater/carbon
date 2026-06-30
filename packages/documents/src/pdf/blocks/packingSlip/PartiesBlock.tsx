import { Text, View } from "@react-pdf/renderer";
import { AddressBlock } from "../../components";
import { useTw } from "../tw";
import type { PackingSlipData } from "./types";

/** Ship To, Sold To, and Ship From addresses in three columns. */
export function PartiesBlock({ data }: { data: PackingSlipData }) {
  const tw = useTw();
  const columnLabel = tw("text-[9px] font-bold text-gray-600 mb-1 uppercase");
  const columnBody = tw("text-[9px] text-gray-800");

  const { customer, shippingAddress, soldToAddress, company } = data;
  const soldTo = soldToAddress ?? shippingAddress;

  return (
    <View style={tw("border border-gray-200 mb-4")}>
      <View style={tw("flex flex-row")}>
        <View style={tw("w-1/3 p-3 border-r border-gray-200")}>
          <Text style={columnLabel}>Ship To</Text>
          <View style={columnBody}>
            <AddressBlock
              name={customer.name}
              addressLine1={shippingAddress?.addressLine1}
              addressLine2={shippingAddress?.addressLine2}
              city={shippingAddress?.city}
              stateProvince={shippingAddress?.stateProvince}
              postalCode={shippingAddress?.postalCode}
              country={shippingAddress?.countryCode}
            />
          </View>
        </View>

        <View style={tw("w-1/3 p-3 border-r border-gray-200")}>
          <Text style={columnLabel}>Sold To</Text>
          <View style={columnBody}>
            <AddressBlock
              name={customer.name}
              addressLine1={soldTo?.addressLine1}
              addressLine2={soldTo?.addressLine2}
              city={soldTo?.city}
              stateProvince={soldTo?.stateProvince}
              postalCode={soldTo?.postalCode}
              country={soldTo?.countryCode}
            />
          </View>
        </View>

        <View style={tw("w-1/3 p-3")}>
          <Text style={columnLabel}>Ship From</Text>
          <View style={columnBody}>
            <AddressBlock
              name={company.name}
              addressLine1={company.addressLine1}
              addressLine2={company.addressLine2}
              city={company.city}
              stateProvince={company.stateProvince}
              postalCode={company.postalCode}
              country={company.countryCode}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
