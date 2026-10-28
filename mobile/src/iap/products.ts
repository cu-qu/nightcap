import { getApiBaseUrl } from "@/src/api/client";

export const MONTHLY_PRODUCT_ID = "com.nightcap.app.couple.monthly";
export const YEARLY_PRODUCT_ID = "com.nightcap.app.couple.yearly";

export const ALL_PRODUCT_IDS = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID];

function legalPageUrl(path: "privacy" | "terms" | "support"): string {
  return `${getApiBaseUrl()}/${path}/`;
}

/** Hosted on the API origin (`EXPO_PUBLIC_API_URL`), not a marketing domain. */
export const LEGAL_URLS = {
  get terms() {
    return legalPageUrl("terms");
  },
  get privacy() {
    return legalPageUrl("privacy");
  },
  get support() {
    return legalPageUrl("support");
  },
  manageApple: "https://apps.apple.com/account/subscriptions",
  manageGoogle: "https://play.google.com/store/account/subscriptions",
};
