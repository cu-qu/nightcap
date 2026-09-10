import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  dateFromReminderTime,
  formatReminderTime,
} from "@/src/notifications/reminders";
import { colors } from "@/src/theme/colors";

const PRESETS = [
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 22, minute: 0 },
];

type Props = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
};

export function ReminderTimePicker({ hour, minute, onChange }: Props) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const value = useMemo(
    () => dateFromReminderTime(hour, minute),
    [hour, minute]
  );
  const native = Platform.OS === "ios" || Platform.OS === "android";
  const showPicker = native && (Platform.OS === "ios" || androidOpen);

  function apply(next: Date) {
    onChange(next.getHours(), next.getMinutes());
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setAndroidOpen(false);
    if (event.type === "dismissed" || !selected) return;
    apply(selected);
  }

  return (
    <View>
      <View style={styles.presets}>
        {PRESETS.map((preset) => {
          const on = preset.hour === hour && preset.minute === minute;
          return (
            <Pressable
              key={`${preset.hour}:${preset.minute}`}
              onPress={() => onChange(preset.hour, preset.minute)}
              style={[styles.preset, on && styles.presetOn]}
            >
              <Text style={[styles.presetText, on && styles.presetTextOn]}>
                {formatReminderTime(preset.hour, preset.minute)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {Platform.OS === "ios" ? (
        <Text style={styles.timeValue}>{formatReminderTime(hour, minute)}</Text>
      ) : null}

      {Platform.OS === "android" ? (
        <Pressable
          onPress={() => setAndroidOpen(true)}
          style={styles.timeButton}
          accessibilityRole="button"
          accessibilityLabel="Choose a custom reminder time"
        >
          <Text style={styles.timeLabel}>Custom time</Text>
          <Text style={styles.androidTime}>
            {formatReminderTime(hour, minute)}
          </Text>
        </Pressable>
      ) : null}

      {Platform.OS === "web" ? (
        <Text style={styles.webHint}>
          {formatReminderTime(hour, minute)} · reminders fire on iPhone and
          Android
        </Text>
      ) : null}

      {showPicker ? (
        <DateTimePicker
          value={value}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPickerChange}
          themeVariant="dark"
          textColor={colors.text}
          accentColor={colors.accent}
          minuteInterval={Platform.OS === "ios" ? 5 : undefined}
          style={styles.spinner}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  preset: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
  },
  presetText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  presetTextOn: {
    color: colors.text,
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  timeLabel: {
    fontSize: 15,
    color: colors.muted,
  },
  timeValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  androidTime: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  webHint: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
  spinner: {
    height: 180,
    alignSelf: "stretch",
  },
});
