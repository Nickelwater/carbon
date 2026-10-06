import { buildAllToolMetadataWithValidators, MODULE_LIST } from "./lib/service-metadata";
import { getDbTablesWithColumn } from "./lib/db-types";

async function main() {
  console.log("start full");
  console.time("full");
  const result = await buildAllToolMetadataWithValidators({
    onModule: (mod, count) => console.log("  ✓", mod, count),
  });
  console.timeEnd("full");
  console.log("tools", result.tools.length);
  const companyTables = getDbTablesWithColumn("companyId");
  console.log("company tables", companyTables.length);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
