import { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/src/theme/colors";

type Props = {
  visible: boolean;
  /** Called mid-swirl so the next screen can mount under the overlay */
  onTransition?: () => void;
  /** Called when the overlay should dismiss */
  onFinished: () => void;
};

const RISE_MS = 900;
const SWIRL_MS = 550;
const FADE_MS = 280;

export function MoonRiseTransition({
  visible,
  onTransition,
  onFinished,
}: Props) {
  const veil = useSharedValue(0);
  const rise = useSharedValue(0);
  const spin = useSharedValue(0);
  const bloom = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      veil.value = 0;
      rise.value = 0;
      spin.value = 0;
      bloom.value = 0;
      glow.value = 0;
      return;
    }

    veil.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    glow.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
    rise.value = withTiming(1, {
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
    });
    spin.value = withTiming(1, {
      duration: RISE_MS + SWIRL_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    bloom.value = withDelay(
      RISE_MS,
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, {
          duration: SWIRL_MS,
          easing: Easing.in(Easing.cubic),
        })
      )
    );

    const midTimer = setTimeout(() => {
      onTransition?.();
    }, RISE_MS + 80);

    const endTimer = setTimeout(() => {
      veil.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onFinished)();
      });
    }, RISE_MS + SWIRL_MS);

    return () => {
      clearTimeout(midTimer);
      clearTimeout(endTimer);
    };
  }, [visible, onTransition, onFinished, veil, rise, spin, bloom, glow]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
  }));

  const moonStyle = useAnimatedStyle(() => {
    const y = (1 - rise.value) * 340 - bloom.value * 20;
    const scale = 0.55 + rise.value * 0.7 + bloom.value * 6.5;
    const rotate = spin.value * 540 + bloom.value * 180;
    const opacity = 1 - bloom.value * 0.85;
    return {
      opacity,
      transform: [
        { translateY: y },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (0.35 + rise.value * 0.35) * (1 - bloom.value * 0.7),
    transform: [{ scale: 0.8 + rise.value * 0.5 + bloom.value * 3 }],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    opacity: rise.value * 0.55 * (1 - bloom.value),
    transform: [
      { rotate: `${spin.value * -220}deg` },
      { scale: 0.9 + rise.value * 0.25 },
    ],
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <View style={styles.root} pointerEvents="none">
        <Animated.View style={[styles.veil, veilStyle]} />
        <View style={styles.stage}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <Animated.View style={[styles.orbit, orbitStyle]}>
            <View style={styles.orbitDot} />
            <View style={[styles.orbitDot, styles.orbitDotAlt]} />
          </Animated.View>
          <Animated.View style={[styles.moonWrap, moonStyle]}>
            <Text style={styles.moon}>🌙</Text>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
  },
  stage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
  },
  orbit: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.35)",
  },
  orbitDot: {
    position: "absolute",
    top: -4,
    left: "50%",
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentSoft,
  },
  orbitDotAlt: {
    top: undefined,
    bottom: -3,
    backgroundColor: colors.accent,
  },
  moonWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  moon: {
    fontSize: 88,
    textShadowColor: "rgba(167, 139, 250, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
});
