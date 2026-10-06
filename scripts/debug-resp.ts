import { MODULE_LIST } from "./lib/service-metadata";
import { buildServiceAst } from "./lib/service-ast";
import { buildResponseSchemaIndex } from "./lib/response-schema";

console.time("ast");
const ast = buildServiceAst(MODULE_LIST);
console.timeEnd("ast");
ast.project.resolveSourceFileDependencies = () => {};

const items = ast.modules.get("items")!;
const suspects = [
  "upsertItemShelfLife",
  "getItemPackaging",
  "upsertPickMethodWithShelfLife",
  "cascadeItemTrackingType",
  "updateItemMethodAndSourcing",
  "upsertConsumable",
  "matchItemIdByText",
  "resolveItemIdFromExtractedText",
  "upsertPart",
  "updateItem"
];

for (const name of suspects) {
  const fn = items.functions.find((f) => f.name === name);
  if (!fn) {
    console.log("missing", name);
    continue;
  }
  console.log("try", name);
  console.time(name);
  const single = {
    ...ast,
    modules: new Map([["items", { ...items, functions: [fn] }]]),
    project: ast.project
  };
  const timer = setTimeout(() => {
    console.error("TIMEOUT", name);
    process.exit(2);
  }, 15000);
  try {
    buildResponseSchemaIndex(single as any);
  } catch (e) {
    console.error("fail", name, e);
  }
  clearTimeout(timer);
  console.timeEnd(name);
}
console.log("done");
