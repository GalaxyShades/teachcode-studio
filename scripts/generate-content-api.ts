import { mkdirSync, writeFileSync } from "node:fs";
import { contentOpenApi, chapterExample } from "./content-openapi";
mkdirSync("docs/examples", { recursive: true });
writeFileSync(
  "docs/content-api.openapi.json",
  JSON.stringify(contentOpenApi(), null, 2) + "\n",
);
writeFileSync(
  "docs/examples/published-chapter.json",
  JSON.stringify(chapterExample, null, 2) + "\n",
);
