import * as Network from "expo-network";

import { saveRitual } from "@/src/api/ritual";
import {
  enqueueOutbox,
  listPendingOutbox,
  markCalendarDayOptimistic,
  markOutboxSynced,
  type RitualOutboxPayload,
} from "@/src/db/schema";
import { useGoalsStore } from "@/src/store/goalsStore";
import type { RitualRequest, RitualResponse } from "@/src/types/api";
import { isFutureIsoDate } from "@/src/utils/date";

let flushing = false;

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return true;
  }
}

export async function enqueueRitual(
  payload: RitualRequest
): Promise<{ queued: true; response?: RitualResponse }> {
  if (isFutureIsoDate(payload.date)) {
    throw new Error("NightCap cannot be saved for a future date.");
  }
  await enqueueOutbox("ritual", payload);
  await markCalendarDayOptimistic(
    payload.date,
    !!payload.reflection?.trim(),
    payload.mood ?? ""
  );
  const response = await flushOutbox();
  return { queued: true, response };
}

export async function flushOutbox(): Promise<RitualResponse | undefined> {
  if (flushing) return undefined;
  if (!(await isOnline())) return undefined;

  flushing = true;
  let lastResponse: RitualResponse | undefined;

  try {
    const rows = await listPendingOutbox();
    for (const row of rows) {
      if (row.type !== "ritual") continue;
      const payload = JSON.parse(row.payload_json) as RitualOutboxPayload;
      try {
        lastResponse = await saveRitual(payload);
        await markOutboxSynced(row.id);
        void useGoalsStore.getState().invalidate();
      } catch {
        // Keep row pending; stop to preserve order.
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return lastResponse;
}
