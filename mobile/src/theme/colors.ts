export const colors = {
  bg: "#0F0A1A",
  surface: "#1A1228",
  elevated: "#241833",
  border: "#3D2A55",
  muted: "#9B8BB0",
  text: "#F4EEFF",
  accent: "#8B5CF6",
  accentSoft: "#A78BFA",
  accentDeep: "#6D28D9",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  reached: "#60A5FA",
} as const;

export const goalStatusColors: Record<string, string> = {
  on_track: colors.success,
  at_risk: colors.warning,
  behind: colors.danger,
  reached: colors.reached,
};

export const goalStatusLabels: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  reached: "Reached",
};
