import { createServer } from "node:http";
import { z } from "zod";
import { clientStatus, searchOrderContent } from "./order_search.js";

const SearchBody = z.object({
  orderId: z.string().min(1).max(80),
  query: z.string().min(2).max(500),
  topK: z.number().int().min(1).max(10).default(3),
}).strict();

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/search") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const parsed = SearchBody.safeParse(await readBody(request));
    if (!parsed.success) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid search body", issues: parsed.error.issues }));
      return;
    }
    const results = await searchOrderContent(parsed.data.orderId, parsed.data.query, parsed.data.topK);
    response.writeHead(200).end(JSON.stringify({ orderId: parsed.data.orderId, results }));
  } catch (error) {
    response.writeHead(clientStatus(error)).end(JSON.stringify({ error: error instanceof Error ? error.message : "Search failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order search listening on http://localhost:${port}`));
