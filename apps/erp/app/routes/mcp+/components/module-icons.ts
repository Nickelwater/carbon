import type { IconType } from "react-icons";
import {
  LuBox,
  LuCircleUser,
  LuCrown,
  LuFactory,
  LuFiles,
  LuFolderCheck,
  LuLandmark,
  LuLayers,
  LuReceipt,
  LuSettings,
  LuShield,
  LuShoppingCart,
  LuSquareStack,
  LuUsers,
  LuWrench
} from "react-icons/lu";

// Mirrors the ERP's module icons (app/hooks/useModules.tsx). invoicing/account/
// shared have no top-level nav icon, so the closest lucide stands in.
export const MODULE_ICONS: Record<string, IconType> = {
  sales: LuCrown,
  items: LuSquareStack,
  production: LuFactory,
  purchasing: LuShoppingCart,
  resources: LuWrench,
  settings: LuSettings,
  quality: LuFolderCheck,
  accounting: LuLandmark,
  inventory: LuBox,
  people: LuUsers,
  users: LuShield,
  documents: LuFiles,
  invoicing: LuReceipt,
  account: LuCircleUser,
  shared: LuLayers
};

export const FALLBACK_MODULE_ICON: IconType = LuBox;
