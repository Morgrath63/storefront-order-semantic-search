import { latestContentPerStage, type OrderContent } from "./order_search.js";

const orderContent: OrderContent[] = [
  { id: "ord-1042-checkout", orderId: "ORD-1042", stage: "checkout", occurredAt: "2026-08-28T09:15:00Z", text: "Checkout completed for ORD-1042. Payment was accepted and the delivery address was confirmed." },
  { id: "ord-1042-packed", orderId: "ORD-1042", stage: "fulfillment", occurredAt: "2026-08-28T11:20:00Z", text: "ORD-1042 was packed at the Shanghai fulfillment center." },
  { id: "ord-1042-shipped", orderId: "ORD-1042", stage: "fulfillment", occurredAt: "2026-08-28T14:45:00Z", text: "ORD-1042 left the fulfillment center with carrier tracking number SF1042881." },
  { id: "ord-1042-receipt", orderId: "ORD-1042", stage: "receipt", occurredAt: "2026-08-28T09:16:00Z", text: "Receipt R-8821 for ORD-1042 was emailed after checkout." },
  { id: "ord-1042-update", orderId: "ORD-1042", stage: "customer_update", occurredAt: "2026-08-28T14:47:00Z", text: "The customer received an order update confirming shipment and tracking details." },
];

const selected = latestContentPerStage(orderContent);
console.log(JSON.stringify({ selected: selected.length }, null, 2));
