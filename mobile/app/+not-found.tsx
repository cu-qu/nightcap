import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View className="flex-1 items-center justify-center bg-night-bg px-6">
        <Text className="text-xl font-semibold text-night-text">
          Screen not found
        </Text>
        <Link href="/" className="mt-4 text-accent-soft">
          Go home
        </Link>
      </View>
    </>
  );
}
