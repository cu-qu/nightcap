import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { LEGAL_URLS } from "@/src/iap/products";
import { colors } from "@/src/theme/colors";

export function LegalLinks() {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
      >
        <Text style={styles.link}>Privacy</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
      >
        <Text style={styles.link}>Terms of Use</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  dot: {
    color: colors.muted,
  },
});
