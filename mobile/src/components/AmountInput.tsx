import { TextInput, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { sanitizeDecimalInput } from "@/src/utils/date";

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  editable?: boolean;
};

export function AmountInput({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  placeholder = "0",
  editable = true,
}: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          editable={editable}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          onChangeText={(t) => onChangeText(sanitizeDecimalInput(t))}
          style={styles.input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  prefix: {
    marginRight: 8,
    fontSize: 24,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  input: {
    flex: 1,
    fontSize: 30,
    fontWeight: "600",
    color: colors.text,
    padding: 0,
  },
  suffix: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.muted,
  },
});
