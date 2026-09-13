import { Alert } from "react-native";

import { deleteAccount } from "@/src/api/auth";

const DELETE_MESSAGE =
  "This permanently deletes your NightCap account, journal, and photos. This cannot be undone.";

export function confirmDeleteAccount(logout: () => Promise<void>) {
  Alert.alert("Delete account?", DELETE_MESSAGE, [
    { text: "Cancel", style: "cancel" },
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
