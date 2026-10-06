import { createValidatorLoader } from "./lib/validator-loader";

async function main() {
  console.log("start");
  applyProgress();
  const loader = await createValidatorLoader();
  console.log("loader ready");
  console.time("production");
  const result = await loader.load("production");
  console.timeEnd("production");
  console.log({
    error: result.error,
    exportCount: Object.keys(result.exports ?? {}).length,
  });
  await loader.close?.();
}
function applyProgress() {
  setInterval(() => console.log("still alive", process.memoryUsage().heapUsed / 1e6 | 0, "MB"), 5000);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
