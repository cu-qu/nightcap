import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

import { getAccessToken } from "@/src/api/tokens";

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

  if (!token) return null;

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
