import type { OperatingSystemPlatform } from "@carbon/react";
import { parseAcceptLanguage } from "intl-parse-accept-language";

export const getPreferenceHeaders = (request: Request) => {
  const acceptLanguage = request.headers.get("accept-language");
  const locales = parseAcceptLanguage(acceptLanguage, {
    validate: Intl.DateTimeFormat.supportedLocalesOf
  });

  // get whether it's a mac or pc from the headers
  const platform: OperatingSystemPlatform = request.headers
    .get("user-agent")
    ?.includes("Mac")
    ? "mac"
    : "windows";

  return {
    platform,
    locale: locales?.[0] ?? "en-US"
  };
};
