// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { CarbonEdition } from "@carbon/auth";
import { Edition } from "@carbon/utils";
import { useLingui } from "@lingui/react/macro";
import { CgProfile } from "react-icons/cg";
import { LuBell, LuKeyRound, LuShieldCheck } from "react-icons/lu";
import type { RouteGroup } from "~/types";
import { path } from "~/utils/path";

export default function useAccountSubmodules() {
  const { t } = useLingui();
  const accountGroups: RouteGroup[] = [
    {
      name: t`Account`,
      routes: [
        {
          name: t`Notifications`,
          to: path.to.notificationSettings,
          icon: <LuBell />
        },
        {
          name: t`Profile`,
          to: path.to.profile,
          icon: <CgProfile />
        },
        ...(CarbonEdition !== Edition.Cloud
          ? [
              {
                name: t`Password`,
                to: path.to.accountPassword,
                icon: <LuKeyRound />
              }
            ]
          : []),
        {
          name: t`Security`,
          to: path.to.accountSecurity,
          icon: <LuShieldCheck />
        }
      ]
    }
  ];
  return { groups: accountGroups };
}
