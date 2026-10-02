import { useEffect, useState } from "react";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { getApiBaseUrl } from "@/src/api/client";
import { isApiMediaUri } from "@/src/api/nightcaps";
import { getAccessToken } from "@/src/api/tokens";
import { colors } from "@/src/theme/colors";

type Props = {
  uri: string;
  /** Used if the signed bucket URL expires; typically the authenticated API photo route. */
  fallbackUri?: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

function absoluteUri(uri: string): string {
  if (uri.startsWith("/")) return `${getApiBaseUrl()}${uri}`;
  return uri;
}

/** Loads a NightCap photo: signed R2 URL as-is, API proxy with the current JWT. */
export function AuthenticatedImage({
  uri,
  fallbackUri,
  style,
  accessibilityLabel,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [activeUri, setActiveUri] = useState(uri);

  useEffect(() => {
    setActiveUri(uri);
  }, [uri]);

  useEffect(() => {
    let cancelled = false;
    void getAccessToken().then((value) => {
      if (!cancelled) setToken(value);
    });
    return () => {
      cancelled = true;
    };
  }, [activeUri]);

  const resolved = absoluteUri(activeUri);
  const needsAuth = isApiMediaUri(resolved);
  if (needsAuth && !token) {
    return (
      <View
        style={[{ backgroundColor: colors.elevated }, style as StyleProp<ViewStyle>]}
      />
    );
  }

  return (
    <Image
      source={{
        uri: resolved,
        headers: needsAuth && token ? { Authorization: `Bearer ${token}` } : undefined,
      }}
      style={style}
      accessibilityLabel={accessibilityLabel}
      resizeMode="cover"
      onError={() => {
        if (fallbackUri && fallbackUri !== activeUri) {
          setActiveUri(fallbackUri);
        }
      }}
    />
  );
}
