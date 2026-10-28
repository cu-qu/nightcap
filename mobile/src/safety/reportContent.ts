import { Alert } from "react-native";

import { ApiError } from "@/src/api/client";
import { blockPartner, reportPartner } from "@/src/api/partnership";

export function confirmReportContent(options: {
  username: string;
  nightcapUuid?: string;
  onFinished?: () => void;
}) {
  const username = options.username || "your partner";

  async function run(alsoBlock: boolean) {
    try {
      await reportPartner({
        ...(options.nightcapUuid ? { nightcap_uuid: options.nightcapUuid } : {}),
      });
      if (alsoBlock) await blockPartner();
      options.onFinished?.();
      Alert.alert(
        alsoBlock ? "Reported and blocked" : "Reported",
        alsoBlock
          ? `${username} can't link with you again.`
          : "Thanks. We'll review it."
      );
    } catch (error) {
      Alert.alert(
        "Could not report",
        error instanceof ApiError ? error.message : "Try again in a moment."
      );
    }
  }

  Alert.alert(
    `Report ${username}?`,
    options.nightcapUuid
      ? "We'll hide this moment from your recaps and review it."
      : "We'll review what they've shared with you.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Report", onPress: () => void run(false) },
      {
        text: "Report and block",
        style: "destructive",
        onPress: () => void run(true),
      },
    ]
  );
}

export function confirmBlockPartner(username: string, onFinished?: () => void) {
  Alert.alert(
    `Block ${username}?`,
    "You'll unlink, and they won't be able to join you again.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await blockPartner();
              onFinished?.();
            } catch (error) {
              Alert.alert(
                "Could not block",
                error instanceof ApiError ? error.message : "Try again in a moment."
              );
            }
          })();
        },
      },
    ]
  );
}
