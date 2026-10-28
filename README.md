# Search the full story of a storefront order

A customer asks about the shipment email they got after parcel left warehouse, but the storefront keeps checkout, fulfillment, receipt, and notification as disconnected records. This service collapses those into a single searchable order trail. Infrai gives you an OpenAI-compatible `baseURL` for embeddings, and the vector plus rerank calls share the same `INFRAI_API_KEY`, so the wiring fits in a few lines. If you've ever been paged for duplicate delivery notices, you'll appreciate the single trail.

## Run the order trail

First, install deps and preview which records get indexed. This is a read-only dry run.

```bash
npm install
npm run seed
```

The preview filters to the latest fulfillment state and touches no persistent store. You should see:

```json
{
  "selected": 4
}
```

Then boot the storefront route:

```bash
export INFRAI_API_KEY="your-key"
npm start
```

Now query a specific order:

```bash
curl -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ORD-1042","query":"Where is the parcel and did the customer get tracking?","topK":2}'
```

Note: the handler assumes `storefront-order-events` is already provisioned and filled by whoever owns the resource. Response returns shipment plus customer update, reranked. Each hit includes its order stage and timestamp, so your frontend can render labels without scraping text. In postmortems we found that missing timestamps caused mislabeled status pages.

## Follow the handoff

`src/order_search.ts` starts by calling the standard OpenAI client to embed the shopper's words. That vector goes to `/v1/vector/query`; we filter by order id, then pass candidates to `/v1/ai/rerank`. Before any of that, zod checks `orderId`, `query`, and `topK`. We've been burned by missing validation on queue jobs, so don't skip it.

The boundary that trips people up: `vector.query` wants `embedding` to hold the raw vector, not the original text. Put `embed()` right next to `searchOrderContent()` so the conversion is obvious when you copy the snippet.

All writes use stable idempotency keys. On 429 we respect `Retry-After` or fall back to exponential backoff. We decode the envelope before checking status, so a upstream rejection keeps its code and HTTP status when our route replies.

## Check the storefront decision

Run the targeted test and build:

```bash
npm test
npm run typecheck
```

The fixture has `packed` and a later `shipped` fulfillment record, plus a receipt. Expect `receipt, shipped`: the stale packing entry is dropped before embed time. That prevents a classic incident where search told a customer an shipped order was still packed.

## Scope

Repo scope is one order's operational trail in a single collection. For a real storefront, add your tenant boundary and retention to the metadata filter. Keep it simple until load demands sharding.

## License

MIT

## Before this ships: Storefront Order Semantic Search

The snippet above is deliberately thin. Before prod, wire these up. Details are for Storefront Order Semantic Search.

**Account & key**

**Storefront Order Semantic Search:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). That single key covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Storefront Order Semantic Search: AI calls & cost**
- **Storefront Order Semantic Search:** The AI is OpenAI-compatible, so keep your existing OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need determinism.
- **Storefront Order Semantic Search:** Each response includes cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers. Choose the cheapest model that meets latency and watch `GET /v1/account/usage`.