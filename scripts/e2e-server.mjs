import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
rmSync(".next-e2e", { recursive: true, force: true });
const dir = mkdtempSync(join(tmpdir(), "teachcode-e2e-")),
  env = {
    ...process.env,
    DATABASE_MODE: "sqlite",
    SQLITE_DATABASE_PATH: join(dir, "test.db"),
    NEXT_DIST_DIR: ".next-e2e",
  };
const setup = spawnSync(process.execPath, ["scripts/init-local-sqlite.mjs"], {
  env,
  stdio: "inherit",
});
if (setup.status) process.exit(setup.status);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
