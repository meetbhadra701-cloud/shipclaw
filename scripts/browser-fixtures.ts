/** Test-only fault server. Never imported by the production application. */
import express from "express";
import { resolve } from "node:path";
import { InMemoryDb, setDb } from "../src/storage/db.js";
import { setupRoutes } from "../src/server/routes.js";
process.env["ALLOW_LLM_FALLBACK"] = "false";
delete process.env["NEMOTRON_API_KEY"];
delete process.env["GITHUB_TOKEN"];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://api.github.com/")) return nativeFetch(input, init);
  if (url.includes("rate-limit")) return new Response("{}", { status: 429 });
  if (url.includes("server-failure")) return new Response("{}", { status: 503 });
  if (url.includes("/search/issues")) return new Response(JSON.stringify({ total_count: 0, incomplete_results: false }));
  if (url.includes("/commits/")) return new Response("{}", { status: 409 });
  return new Response(JSON.stringify({ full_name: "qa/empty", default_branch: "main", private: false }));
};
setDb(new InMemoryDb());
const app = express(); app.use(express.json()); setupRoutes(app);
app.use(express.static(resolve("dist/ui")));
app.listen(8791, "127.0.0.1", () => console.log("TEST-ONLY fault server: http://127.0.0.1:8791"));
