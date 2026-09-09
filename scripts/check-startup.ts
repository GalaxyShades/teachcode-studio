import { loadEnvConfig } from "@next/env";
import { assertDatabase, db } from "../lib/db";
loadEnvConfig(process.cwd());
assertDatabase()
  .then(() => db().end())
  .catch((e) => {
    console.error(`\nTeachCode startup: ${e.message}\n`);
    process.exit(1);
  });
