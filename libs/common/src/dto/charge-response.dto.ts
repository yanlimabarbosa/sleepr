// RPC contract: shape that the payments service promises to return from the
// 'create_charge' message pattern. reservations consumes only what it needs
// (the id, used as invoiceId) — kept independent of the Stripe SDK on purpose,
// so the reservations service never couples to Stripe types.
export interface ChargeResponse {
  id: string;
}
