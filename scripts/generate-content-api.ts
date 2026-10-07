import { mkdirSync, writeFileSync } from "node:fs";
import { contentOpenApi, lessonExample } from "./content-openapi";
mkdirSync("docs/examples", { recursive: true });
writeFileSync(
  "docs/content-api.openapi.json",
  JSON.stringify(contentOpenApi(), null, 2) + "\n",
);
writeFileSync(
  "docs/examples/published-lesson.json",
  JSON.stringify(lessonExample, null, 2) + "\n",
);
