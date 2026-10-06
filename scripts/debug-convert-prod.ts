import { buildValidatorRegistry } from "./lib/validator-registry";

async function main() {
  console.log("building registry for production only");
  console.time("registry");
  const reg = await buildValidatorRegistry(["production"]);
  console.timeEnd("registry");
  console.log(reg.stats);
  const schema = reg.getSchema("production", "jobOperationValidator");
  console.log(
    "jobOperationValidator id?",
    schema && "id" in ((schema as any).properties ?? {})
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
