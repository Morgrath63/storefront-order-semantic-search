import assert from "node:assert/strict";
import test from "node:test";
import { latestContentPerStage, type OrderContent } from "../src/order_search.js";

test("the index keeps the newest customer-visible state for each order stage", () => {
  const items: OrderContent[] = [
    { id: "packed", orderId: "ORD-9", stage: "fulfillment", occurredAt: "2026-08-28T10:00:00Z", text: "Order packed" },
    { id: "shipped", orderId: "ORD-9", stage: "fulfillment", occurredAt: "2026-08-28T12:00:00Z", text: "Order shipped" },
    { id: "receipt", orderId: "ORD-9", stage: "receipt", occurredAt: "2026-08-28T10:05:00Z", text: "Receipt emailed" },
  ];

  const selected = latestContentPerStage(items);
  assert.deepEqual(selected.map((item) => item.id), ["receipt", "shipped"]);
  assert.equal(selected.some((item) => item.id === "packed"), false);
});
