import { Redirect } from "expo-router";

/** Health categories belong to the `follow_up` group; Spend chips use `daily_spend`. */
export default function FollowUpPlaceholder() {
  return <Redirect href="/(tabs)" />;
}
