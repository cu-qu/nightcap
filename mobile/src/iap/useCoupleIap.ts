import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { verifyStorePurchase } from "@/src/api/billing";
import { ALL_PRODUCT_IDS, MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from "@/src/iap/products";
import type { User } from "@/src/types/api";

export const IAP_SUPPORTED = Platform.OS === "ios" || Platform.OS === "android";

export type StorePrice = {
  id: string;
  displayPrice: string;
  offerTokenAndroid?: string;
};

type CoupleIap = {
  ready: boolean;
  supported: boolean;
  busy: boolean;
  prices: Record<string, StorePrice>;
  subscribe: (productId: string) => Promise<void>;
  restore: () => Promise<boolean>;
  redeemCode: () => Promise<void>;
  manage: () => Promise<void>;
};

function accountToken(user: User | null | undefined): string {
  return user?.partnership?.uuid || String(user?.id || "");
}

function offerTokenOf(entry: { offerTokenAndroid?: string | null } | null | undefined): string {
  return (entry?.offerTokenAndroid || "").trim();
}

export function useCoupleIap(options: {
  user: User | null | undefined;
  onEntitled: () => Promise<void> | void;
  onError?: (message: string) => void;
}): CoupleIap {
  const { user, onEntitled, onError } = options;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<string, StorePrice>>({});
  const iapRef = useRef<null | typeof import("expo-iap")>(null);
  const onEntitledRef = useRef(onEntitled);
  const onErrorRef = useRef(onError);
  const userRef = useRef(user);

  onEntitledRef.current = onEntitled;
  onErrorRef.current = onError;
  userRef.current = user;

  const verifyPurchase = useCallback(async (purchase: {
    productId?: string | null;
    purchaseToken?: string | null;
    isSuspendedAndroid?: boolean | null;
  }) => {
    if (purchase.isSuspendedAndroid) return false;
    const token = purchase.purchaseToken || "";
    if (!token) {
      onErrorRef.current?.("That purchase is missing a receipt. Try Restore.");
      return false;
    }
    const platform = Platform.OS === "ios" ? "apple" : "google";
    await verifyStorePurchase({
      platform,
      purchase_token: token,
      product_id: purchase.productId || undefined,
    });
    await onEntitledRef.current();
    return true;
  }, []);

  useEffect(() => {
    if (!IAP_SUPPORTED) return;
    let cancelled = false;
    let removePurchase: undefined | (() => void);
    let removeError: undefined | (() => void);

    void (async () => {
      try {
        const iap = await import("expo-iap");
        if (cancelled) return;
        iapRef.current = iap;
        await iap.initConnection();
        const subscriptions = await iap.fetchProducts({
          skus: ALL_PRODUCT_IDS,
          type: "subs",
        });
        if (cancelled) return;
        const next: Record<string, StorePrice> = {};
        const list = Array.isArray(subscriptions) ? subscriptions : [];
        for (const item of list) {
          const offers = "subscriptionOffers" in item ? item.subscriptionOffers : null;
          const offer = offers?.find((entry) => offerTokenOf(entry));
          next[item.id] = {
            id: item.id,
            displayPrice: item.displayPrice,
            offerTokenAndroid: offerTokenOf(offer) || undefined,
          };
        }
        setPrices(next);
        const purchaseSub = iap.purchaseUpdatedListener(async (purchase) => {
          try {
            const ok = await verifyPurchase(purchase);
            if (ok) {
              await iap.finishTransaction({ purchase, isConsumable: false });
            }
          } catch (e) {
            onErrorRef.current?.(
              e instanceof Error ? e.message : "Could not verify that purchase."
            );
          } finally {
            setBusy(false);
          }
        });
        const errorSub = iap.purchaseErrorListener((error) => {
          setBusy(false);
          const cancelledPurchase =
            error?.code === "user-cancelled" ||
            String(error?.code || "").toLowerCase().includes("cancel");
          if (cancelledPurchase) return;
          onErrorRef.current?.(error.message || "Purchase failed.");
        });
        removePurchase =
          typeof purchaseSub === "function"
            ? purchaseSub
            : () => purchaseSub?.remove?.();
        removeError =
          typeof errorSub === "function" ? errorSub : () => errorSub?.remove?.();
        setReady(true);
      } catch {
        if (!cancelled) {
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      removePurchase?.();
      removeError?.();
      const iap = iapRef.current;
      if (iap) void iap.endConnection();
    };
  }, [verifyPurchase]);

  const subscribe = useCallback(async (productId: string) => {
    if (!IAP_SUPPORTED) {
      onErrorRef.current?.(
        "Subscribe on the iPhone or Android app. Web billing is not available yet."
      );
      return;
    }
    const iap = iapRef.current;
    if (!iap) {
      onErrorRef.current?.(
        "Purchases need a development or App Store build — they are not available in Expo Go."
      );
      return;
    }
    setBusy(true);
    try {
      const price = prices[productId];
      const token = accountToken(userRef.current);
      await iap.requestPurchase({
        type: "subs",
        request: {
          apple: { sku: productId, appAccountToken: token },
          google: {
            skus: [productId],
            obfuscatedAccountId: token.slice(0, 64),
            ...(price?.offerTokenAndroid
              ? { subscriptionOffers: [{ sku: productId, offerToken: price.offerTokenAndroid }] }
              : {}),
          },
        },
      });
    } catch (e) {
      setBusy(false);
      onErrorRef.current?.(e instanceof Error ? e.message : "Could not start the purchase.");
    }
  }, [prices]);

  const restore = useCallback(async () => {
    if (!IAP_SUPPORTED) {
      onErrorRef.current?.("Restore purchases on the iPhone or Android app.");
      return false;
    }
    const iap = iapRef.current;
    if (!iap) {
      onErrorRef.current?.("Purchases need a development or App Store build.");
      return false;
    }
    setBusy(true);
    try {
      const purchases = await iap.getAvailablePurchases();
      let restored = false;
      for (const purchase of purchases || []) {
        try {
          const ok = await verifyPurchase(purchase);
          if (ok) {
            await iap.finishTransaction({ purchase, isConsumable: false });
            restored = true;
          }
        } catch {
          // try the next receipt
        }
      }
      if (!restored) {
        onErrorRef.current?.("No NightCap subscription found for this store account.");
      }
      return restored;
    } catch (e) {
      onErrorRef.current?.(e instanceof Error ? e.message : "Could not restore purchases.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [verifyPurchase]);

  const redeemCode = useCallback(async () => {
    if (Platform.OS !== "ios") {
      onErrorRef.current?.(
        "Apple offer codes redeem on iPhone. Google Play promo codes redeem in the Play Store app."
      );
      return;
    }
    const iap = iapRef.current;
    if (!iap?.openRedeemOfferCode) {
      onErrorRef.current?.("Offer codes need an App Store build.");
      return;
    }
    setBusy(true);
    try {
      const purchase = await iap.openRedeemOfferCode();
      if (purchase && (await verifyPurchase(purchase))) {
        await iap.finishTransaction({ purchase, isConsumable: false });
        return;
      }
      const purchases = await iap.getAvailablePurchases();
      for (const item of purchases || []) {
        try {
          const ok = await verifyPurchase(item);
          if (ok) {
            await iap.finishTransaction({ purchase: item, isConsumable: false });
            return;
          }
        } catch {
          // try the next receipt
        }
      }
    } catch (e) {
      onErrorRef.current?.(
        e instanceof Error ? e.message : "Could not open Apple's redeem sheet."
      );
    } finally {
      setBusy(false);
    }
  }, [verifyPurchase]);

  const manage = useCallback(async () => {
    const iap = iapRef.current;
    if (iap?.deepLinkToSubscriptions) {
      await iap.deepLinkToSubscriptions({
        skuAndroid: prices[YEARLY_PRODUCT_ID]?.id || MONTHLY_PRODUCT_ID,
      });
      return;
    }
    const { Linking } = await import("react-native");
    await Linking.openURL(
      Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions"
    );
  }, [prices]);

  return {
    ready,
    supported: IAP_SUPPORTED,
    busy,
    prices,
    subscribe,
    restore,
    redeemCode,
    manage,
  };
}
