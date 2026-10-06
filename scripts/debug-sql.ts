import { loadSqlFunctionEffects } from "../packages/database/src/sql-effects";

async function main() {
  console.log("start sql");
  const iv = setInterval(
    () => console.log("alive", (process.memoryUsage().heapUsed / 1e6) | 0, "MB"),
    5000
  );
  console.time("sql");
  const sql = await loadSqlFunctionEffects();
  console.timeEnd("sql");
  clearInterval(iv);
  console.log(sql.stats);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
