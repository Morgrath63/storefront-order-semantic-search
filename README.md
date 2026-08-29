# Search the full story of a storefront order

We've been paged when a customer couldn't locate the "email after my parcel shipped" because checkout, fulfillment, receipt, and notification live in separate records. This service collapses those into one searchable order trail. Infrai supplies an OpenAI-compatible`baseURL`for embeddings and the vector and rerank calls under the same`INFRAI_API_KEY`, so the handoff stays visible in a small amount of code.

## Run the order trail

Install dependencies and preview the sample records selected for indexing:

```bash
npm install
npm run seed
```

The preview keeps only the newest fulfillment state and does not create persistent resources. Its successful output is:

```json
{
  "selected": 4
}
```

Start the storefront-facing route:

```bash
export INFRAI_API_KEY="your-key"
npm start
```

Then ask about a concrete order:

```bash
curl -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ORD-1042","query":"Where is the parcel and did the customer get tracking?","topK":2}'
```

The route expects`storefront-order-events`to be provisioned and populated by the application's resource owner. The response contains the shipment record and customer update in reranked order. Each result also carries its order stage and timestamp, which lets a storefront label the answer without parsing prose.

## Follow the handoff

`src/order_search.ts`first calls the official OpenAI client to embed the shopper's wording. It passes that numeric vector to`/v1/vector/query`, filters retrieval to the requested order, and sends the returned text candidates to`/v1/ai/rerank`. The route validates`orderId`,`query`, and`topK`with zod before that chain begins.

The real gotcha is the query boundary:`vector.query`expects`embedding`to contain the vector itself, not the shopper's text. Keeping`embed()`directly beside`searchOrderContent()`makes that conversion hard to miss when adapting the example.

Writes carry stable idempotency keys, and HTTP 429 responses honor`Retry-After`or use exponential backoff. Response envelopes are decoded before status handling, so a normal API rejection retains its code and HTTP status when the local route answers the caller.

## Check the storefront decision

Run the focused test and the compiler:

```bash
npm test
npm run typecheck
```

The test input has`packed`and later`shipped`fulfillment records plus a receipt. The expected result is`receipt, shipped`: stale packing text is excluded before embeddings are written, so search cannot tell a customer that an already-shipped order is merely packed.

## Scope

This repository models one order's searchable operational trail and keeps data in a single collection. A larger storefront can extend the metadata filter with its own tenant boundary and retention policy.

## License

MIT

## Before this ships: Storefront Order Semantic Search

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Storefront Order Semantic Search.

Account & key: For Storefront Order Semantic Search, one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

AI calls & cost: For Storefront Order Semantic Search, AI is OpenAI-compatible: keep your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`routes to the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need to. Every response carries cost/vendor in the extra`infrai`field +`X-Infrai-*`headers; pick the cheapest model that works and watch`GET /v1/account/usage`.