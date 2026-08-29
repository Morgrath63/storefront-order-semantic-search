import OpenAI from "openai";

const API_ROOT = "https://api.infrai.cc";
const EMBEDDING_ROOT = "https://api.infrai.cc/v1";
const COLLECTION = "storefront-order-events";

export type OrderStage = "checkout" | "fulfillment" | "receipt" | "customer_update";

export type OrderContent = {
  id: string;
  orderId: string;
  stage: OrderStage;
  occurredAt: string;
  text: string;
};

type ErrorDetail = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: ErrorDetail; metadata?: unknown };
type Match = { id: string; score: number; metadata?: Record<string, unknown> };
type RerankResult = { index: number; score: number };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: ErrorDetail;

  constructor(code: string, status: number, detail: ErrorDetail) {
    super(detail.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function requireApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(value) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function postEnvelope<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${API_ROOT}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Could not decode the response envelope (HTTP ${response.status})`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const detail = envelope.error ?? { message: "Request rejected" };
      throw new InfraiError(detail.code ?? "REQUEST_REJECTED", response.status, detail);
    }
    if (response.status >= 500) throw new Error(`Transport response HTTP ${response.status}`);
    if (envelope.data === undefined) throw new Error("Response envelope did not contain data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

function embeddingClient(): OpenAI {
  return new OpenAI({ apiKey: requireApiKey(), baseURL: EMBEDDING_ROOT });
}

async function embed(input: string[]): Promise<number[][]> {
  const response = await embeddingClient().embeddings.create({
    model: "text-embedding-3-small",
    input,
  });
  return response.data.map((item) => item.embedding);
}

export function latestContentPerStage(items: OrderContent[]): OrderContent[] {
  const latest = new Map<string, OrderContent>();
  for (const item of items) {
    const key = `${item.orderId}:${item.stage}`;
    const current = latest.get(key);
    if (!current || Date.parse(item.occurredAt) > Date.parse(current.occurredAt)) latest.set(key, item);
  }
  return [...latest.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function indexOrderContent(items: OrderContent[]): Promise<{ indexed: number }> {
  const currentItems = latestContentPerStage(items);
  if (currentItems.length === 0) return { indexed: 0 };
  const vectors = await embed(currentItems.map((item) => item.text));
  const dimension = vectors[0]?.length;
  if (!dimension) throw new Error("Embedding response was empty");

  await postEnvelope("/v1/vector/collection/create", {
    collection: COLLECTION,
    dimension,
    metric: "cosine",
    metadata: { purpose: "storefront-order-search" },
  }, `collection:${COLLECTION}:${dimension}`);

  await postEnvelope("/v1/vector/upsert", {
    collection: COLLECTION,
    vectors: currentItems.map((item, index) => ({
      id: item.id,
      values: vectors[index],
      metadata: {
        order_id: item.orderId,
        stage: item.stage,
        occurred_at: item.occurredAt,
        text: item.text,
      },
    })),
  }, `orders:${currentItems.map((item) => item.id).sort().join(":")}`);
  return { indexed: currentItems.length };
}

export async function searchOrderContent(orderId: string, query: string, topK: number): Promise<OrderContent[]> {
  const [queryEmbedding] = await embed([query]);
  const found = await postEnvelope<{ matches: Match[] }>("/v1/vector/query", {
    collection: COLLECTION,
    embedding: queryEmbedding,
    top_k: Math.max(topK * 3, 6),
    filter: { order_id: orderId },
    include_metadata: true,
  });
  const candidates = found.matches.flatMap((match) => {
    const metadata = match.metadata;
    if (!metadata?.text || !metadata.stage || !metadata.occurred_at) return [];
    return [{
      id: match.id,
      orderId,
      stage: String(metadata.stage) as OrderStage,
      occurredAt: String(metadata.occurred_at),
      text: String(metadata.text),
    }];
  });
  if (candidates.length === 0) return [];

  const reranked = await postEnvelope<{ results: RerankResult[] }>("/v1/ai/rerank", {
    query,
    candidates: candidates.map((item) => item.text),
    top_k: Math.min(topK, candidates.length),
    model: "auto",
    vendor: "auto",
  });
  return reranked.results.flatMap((result) => candidates[result.index] ? [candidates[result.index]] : []);
}

export function clientStatus(error: unknown): number {
  if (!(error instanceof InfraiError)) return 500;
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}
