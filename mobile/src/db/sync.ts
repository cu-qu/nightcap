import * as Network from "expo-network";

import { deleteNightCapPhoto, uploadNightCapPhoto } from "@/src/api/nightcaps";
import { saveRitual } from "@/src/api/ritual";
import {
  enqueueOutbox,
  listPendingOutbox,
  markCalendarDayOptimistic,
  markOutboxSynced,
  type NightCapPhotoOutboxPayload,
  type RitualOutboxPayload,
} from "@/src/db/schema";
import { useGoalsStore } from "@/src/store/goalsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import type { RitualRequest, RitualResponse } from "@/src/types/api";
import { isFutureIsoDate } from "@/src/utils/date";

let flushing = false;
let flushAgain = false;

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
  const ritualId = await enqueueOutbox("ritual", payload);
  const draft = useRitualDraftStore.getState();
  const hasLocalPhoto = !!draft.favoritePhotoUri;
  if (draft.photoCleared && !hasLocalPhoto) {
    await enqueueOutbox("nightcap_photo", {
      date: payload.date,
      clear: true,
    } satisfies NightCapPhotoOutboxPayload);
  } else if (hasLocalPhoto) {
    await enqueueOutbox("nightcap_photo", {
      date: payload.date,
      localUri: draft.favoritePhotoUri,
      name: draft.favoritePhotoName || "moment.jpg",
      type: draft.favoritePhotoType || "image/jpeg",
    } satisfies NightCapPhotoOutboxPayload);
  }
  await markCalendarDayOptimistic(
    payload.date,
    !!payload.reflection?.trim(),
    payload.mood ?? "",
    {
      favoriteMoment: payload.favorite_moment ?? "",
      hasFavoritePhoto: hasLocalPhoto || (draft.hasRemotePhoto && !draft.photoCleared),
    }
  );
  const response = await flushOutbox();
  if (await isOnline()) {
    const pending = await listPendingOutbox();
    if (pending.some((row) => row.id === ritualId)) {
      throw new Error("Could not save NightCap.");
    }
  }
  return { queued: true, response };
}

export async function flushOutbox(): Promise<RitualResponse | undefined> {
  if (flushing) {
    flushAgain = true;
    return undefined;
  }
  if (!(await isOnline())) return undefined;

  flushing = true;
  let lastResponse: RitualResponse | undefined;
  let ritualFailed = false;

  try {
    do {
      flushAgain = false;
      const rows = await listPendingOutbox();
      for (const row of rows) {
        if (row.type === "ritual") {
          const payload = JSON.parse(row.payload_json) as RitualOutboxPayload;
          try {
            lastResponse = await saveRitual(payload);
            await markOutboxSynced(row.id);
            void useGoalsStore.getState().invalidate();
          } catch {
            // Keep row pending; stop to preserve order.
            ritualFailed = true;
            break;
          }
          continue;
        }
        if (row.type === "nightcap_photo") {
          const payload = JSON.parse(row.payload_json) as NightCapPhotoOutboxPayload;
          try {
            if ("clear" in payload && payload.clear) {
              await deleteNightCapPhoto(payload.date);
            } else if ("localUri" in payload) {
              await uploadNightCapPhoto(payload.date, {
                uri: payload.localUri,
                name: payload.name,
                type: payload.type,
              });
            }
            await markOutboxSynced(row.id);
          } catch {
            // Photo failures must not block later NightCap text/entry saves.
            continue;
          }
        }
      }
      if (ritualFailed) break;
    } while (flushAgain);
  } finally {
    flushing = false;
  }

  if (flushAgain && !ritualFailed) {
    return (await flushOutbox()) ?? lastResponse;
  }
  return lastResponse;
}
