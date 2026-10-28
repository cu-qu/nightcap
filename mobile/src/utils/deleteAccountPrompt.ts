import { Alert, Linking, Platform } from "react-native";

import { deleteAccount } from "@/src/api/auth";
import { LEGAL_URLS } from "@/src/iap/products";

const DELETE_MESSAGE =
  Platform.OS === "android"
    ? "This permanently deletes your NightCap account, journal, and photos. This cannot be undone. Deleting your account does not cancel a Google Play subscription. Cancel that in Play Store → Payments & subscriptions, or billing continues."
    : "This permanently deletes your NightCap account, journal, and photos. This cannot be undone. Deleting your account does not cancel an Apple subscription. Cancel that in Settings → Apple ID → Subscriptions, or billing continues.";

export function confirmDeleteAccount(logout: () => Promise<void>) {
  Alert.alert("Delete account?", DELETE_MESSAGE, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Manage subscription",
      onPress: () => {
        void Linking.openURL(
          Platform.OS === "android" ? LEGAL_URLS.manageGoogle : LEGAL_URLS.manageApple
        );
      },
    },
    {
      text: "Delete account",
      style: "destructive",
      onPress: () => {
        void (async () => {
          try {
            await deleteAccount();
            await logout();
          } catch (e) {
            Alert.alert(
              "Could not delete account",
              e instanceof Error ? e.message : "Try again."
            );
          }
        })();
      },
    },
  ]);
}
