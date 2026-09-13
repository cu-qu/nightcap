import { apiRequest } from "@/src/api/client";
import type { BillingResponse, Membership } from "@/src/types/api";

export async function fetchBilling(): Promise<BillingResponse> {
  return apiRequest<BillingResponse>("/api/v1/billing/");
}

export async function verifyStorePurchase(input: {
  platform: "apple" | "google";
  purchase_token: string;
  product_id?: string;
}): Promise<{ membership: Membership }> {
  return apiRequest("/api/v1/billing/verify/", {
    method: "POST",
    body: input,
  });
}
