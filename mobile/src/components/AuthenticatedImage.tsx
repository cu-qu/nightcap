import { useEffect, useState } from "react";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { getAccessToken } from "@/src/api/tokens";
import { colors } from "@/src/theme/colors";

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

/** Loads a private API image with the current JWT. */
export function AuthenticatedImage({
  uri,
  style,
  accessibilityLabel,
}: Props) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAccessToken().then((value) => {
      if (!cancelled) setToken(value);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!token) {
    return (
      <View
        style={[{ backgroundColor: colors.elevated }, style as StyleProp<ViewStyle>]}
      />
    );
  }

  return (
    <Image
      source={{
        uri,
        headers: { Authorization: `Bearer ${token}` },
      }}
      style={style}
      accessibilityLabel={accessibilityLabel}
      resizeMode="cover"
    />
  );
}
