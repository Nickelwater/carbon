import { Text, View } from "@react-pdf/renderer";
import { createTw } from "react-pdf-tailwind";

const tw = createTw({
  theme: {
    fontFamily: {
      sans: ["Helvetica", "Arial", "sans-serif"]
    }
  }
});

interface FooterProps {
  label?: string;
}

const Footer = ({ label }: FooterProps) => {
  return (
    <View style={tw("absolute bottom-0 left-0 right-0 px-10 pb-5")} fixed>
      <View
        style={tw(
          "flex flex-row justify-between items-center text-sm text-gray-500"
        )}
      >
        <Text>{label ?? ""}</Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </View>
  );
};

export default Footer;
