import { useEffect } from "react";
import { Dimensions, Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { colors } from "@/src/theme/colors";

type Props = {
  visible: boolean;
  /** Navigate under the overlay (e.g. to Calendar). */
  onTransition?: () => void;
  onFinished: () => void;
};

const { width: W, height: H } = Dimensions.get("window");
const FLY_MS = 1400;
const HOLD_MS = 180;
const FADE_MS = 380;
const ANGLE = -34;

/** Start / end of the comet path (top-left → bottom-right). */
const X0 = -80;
const X1 = W + 60;
const Y0 = H * 0.16;
const Y1 = H * 0.78;

const TRAIL = [
  { lag: 0.03, size: 0.95, width: 120, height: 5 },
  { lag: 0.07, size: 0.65, width: 95, height: 4 },
  { lag: 0.12, size: 0.4, width: 70, height: 3 },
  { lag: 0.18, size: 0.22, width: 48, height: 2 },
] as const;

const SPARKS = [
  { lag: 0.1, dx: -18, dy: 14, emoji: "✨", size: 16 },
  { lag: 0.22, dx: 10, dy: -12, emoji: "✦", size: 14 },
  { lag: 0.34, dx: -8, dy: 18, emoji: "✧", size: 12 },
  { lag: 0.48, dx: 14, dy: 8, emoji: "✨", size: 18 },
  { lag: 0.6, dx: -14, dy: -10, emoji: "⋆", size: 20 },
] as const;

const FIELD = [
  { x: 0.12, y: 0.2, s: 2, delay: 0 },
  { x: 0.28, y: 0.12, s: 1.5, delay: 120 },
  { x: 0.72, y: 0.18, s: 2.5, delay: 60 },
  { x: 0.88, y: 0.28, s: 1.5, delay: 200 },
  { x: 0.18, y: 0.55, s: 2, delay: 90 },
  { x: 0.55, y: 0.42, s: 1.5, delay: 160 },
  { x: 0.8, y: 0.62, s: 2, delay: 40 },
  { x: 0.42, y: 0.7, s: 1.5, delay: 220 },
  { x: 0.65, y: 0.82, s: 2, delay: 140 },
] as const;

function pathAt(t: number) {
  "worklet";
  return {
    x: interpolate(t, [0, 1], [X0, X1]),
    y: interpolate(t, [0, 1], [Y0, Y1]),
  };
}

function TrailSegment({
  progress,
  lag,
  size,
  width,
  height,
}: {
  progress: SharedValue<number>;
  lag: number;
  size: number;
  width: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => {
    const raw = progress.value - lag;
    const t = Math.max(0, Math.min(1, raw));
    const { x, y } = pathAt(t);
    const fadeIn = interpolate(t, [0, 0.08], [0, 1], "clamp");
    const fadeOut = interpolate(progress.value, [0.78, 1], [1, 0], "clamp");
    const stretch = interpolate(t, [0, 0.2, 0.85, 1], [0.35, 1, 0.85, 0.2], "clamp");
    return {
      opacity: fadeIn * fadeOut * size,
      transform: [
        { translateX: x - width * 0.85 },
        { translateY: y - height / 2 },
        { rotate: `${ANGLE}deg` },
        { scaleX: stretch },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.trail,
        { width, height, borderRadius: height },
        style,
      ]}
    />
  );
}

function Spark({
  progress,
  lag,
  dx,
  dy,
  emoji,
  size,
}: {
  progress: SharedValue<number>;
  lag: number;
  dx: number;
  dy: number;
  emoji: string;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const born = progress.value >= lag;
    if (!born) {
      return { opacity: 0, transform: [{ scale: 0 }] };
    }
    const life = Math.min(1, (progress.value - lag) / 0.28);
    const { x, y } = pathAt(lag);
    const driftX = interpolate(life, [0, 1], [0, dx]);
    const driftY = interpolate(life, [0, 1], [0, dy]);
    const opacity = interpolate(life, [0, 0.2, 1], [0, 1, 0], "clamp");
    const scale = interpolate(life, [0, 0.25, 1], [0.3, 1.15, 0.4], "clamp");
    return {
      opacity,
      transform: [
        { translateX: x + driftX },
        { translateY: y + driftY },
        { scale },
      ],
    };
  });

  return (
    <Animated.Text style={[styles.spark, { fontSize: size }, style]}>
      {emoji}
    </Animated.Text>
  );
}

function FieldDot({
  twinkle,
  x,
  y,
  s,
  phase,
}: {
  twinkle: SharedValue<number>;
  x: number;
  y: number;
  s: number;
  phase: number;
}) {
  const style = useAnimatedStyle(() => {
    const wave = Math.sin((twinkle.value + phase) * Math.PI * 2);
    const opacity = 0.15 + (wave * 0.5 + 0.5) * 0.55;
    return {
      opacity: twinkle.value * opacity,
      transform: [{ scale: 0.7 + (wave * 0.5 + 0.5) * 0.5 }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.fieldDot,
        {
          left: W * x,
          top: H * y,
          width: s,
          height: s,
          borderRadius: s,
        },
        style,
      ]}
    />
  );
}

export function ShootingStarTransition({
  visible,
  onTransition,
  onFinished,
}: Props) {
  const progress = useSharedValue(0);
  const veil = useSharedValue(0);
  const caption = useSharedValue(0);
  const twinkle = useSharedValue(0);
  const bloom = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      veil.value = 0;
      caption.value = 0;
      twinkle.value = 0;
      bloom.value = 0;
      return;
    }

    veil.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
    caption.value = withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withDelay(
        FLY_MS - 200,
        withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })
      )
    );
    twinkle.value = withTiming(1, { duration: 400 });
    progress.value = withDelay(
      180,
      withTiming(1, {
        duration: FLY_MS,
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      })
    );
    bloom.value = withDelay(
      180 + Math.floor(FLY_MS * 0.82),
      withSequence(
        withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) })
      )
    );

    const midTimer = setTimeout(() => {
      onTransition?.();
    }, 180 + Math.floor(FLY_MS * 0.62));

    const endTimer = setTimeout(() => {
      veil.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onFinished)();
      });
    }, 180 + FLY_MS + HOLD_MS);

    return () => {
      clearTimeout(midTimer);
      clearTimeout(endTimer);
    };
  }, [
    visible,
    onTransition,
    onFinished,
    progress,
    veil,
    caption,
    twinkle,
    bloom,
  ]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
  }));

  const captionStyle = useAnimatedStyle(() => ({
    opacity: caption.value,
    transform: [
      {
        translateY: interpolate(caption.value, [0, 1], [12, 0]),
      },
      { scale: interpolate(caption.value, [0, 1], [0.96, 1]) },
    ],
  }));

  const starStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const { x, y } = pathAt(t);
    const scale = interpolate(
      t,
      [0, 0.12, 0.75, 0.9, 1],
      [0.2, 1.25, 1.05, 1.35, 0.15],
      "clamp"
    );
    const opacity = interpolate(t, [0, 0.06, 0.88, 1], [0, 1, 1, 0], "clamp");
    const wobble = Math.sin(t * Math.PI * 3) * 3;
    return {
      opacity,
      transform: [
        { translateX: x - 28 },
        { translateY: y - 28 + wobble },
        { rotate: `${ANGLE}deg` },
        { scale },
      ],
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const { x, y } = pathAt(t);
    const opacity = interpolate(t, [0, 0.1, 0.85, 1], [0, 0.7, 0.55, 0], "clamp");
    const scale = interpolate(t, [0, 0.2, 1], [0.4, 1.3, 0.8], "clamp");
    return {
      opacity,
      transform: [
        { translateX: x - 40 },
        { translateY: y - 40 },
        { scale },
      ],
    };
  });

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value * 0.55,
    transform: [{ scale: 0.6 + bloom.value * 1.8 }],
  }));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View style={styles.root} pointerEvents="none">
        <Animated.View style={[styles.veil, veilStyle]} />
        <View style={styles.vignette} />

        {FIELD.map((dot, i) => (
          <FieldDot
            key={i}
            twinkle={twinkle}
            x={dot.x}
            y={dot.y}
            s={dot.s}
            phase={dot.delay / 400}
          />
        ))}

        <Animated.View style={[styles.bloom, bloomStyle]} />

        <Animated.View style={[styles.captionWrap, captionStyle]}>
          <Text style={styles.caption}>NightCap saved</Text>
          <Text style={styles.captionSub}>Sweet dreams</Text>
        </Animated.View>

        {TRAIL.map((seg, i) => (
          <TrailSegment
            key={i}
            progress={progress}
            lag={seg.lag}
            size={seg.size}
            width={seg.width}
            height={seg.height}
          />
        ))}

        <Animated.View style={[styles.halo, haloStyle]} />

        {SPARKS.map((spark, i) => (
          <Spark
            key={i}
            progress={progress}
            lag={spark.lag}
            dx={spark.dx}
            dy={spark.dy}
            emoji={spark.emoji}
            size={spark.size}
          />
        ))}

        <Animated.View style={[styles.starWrap, starStyle]}>
          <Text style={styles.star}>🌟</Text>
        </Animated.View>
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
    backgroundColor: "#0A0614",
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(109, 40, 217, 0.12)",
  },
  fieldDot: {
    position: "absolute",
    backgroundColor: "#E9D5FF",
  },
  captionWrap: {
    position: "absolute",
    top: H * 0.2,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  caption: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: colors.accentSoft,
    textShadowColor: "rgba(139, 92, 246, 0.7)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  captionSub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
  },
  trail: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: colors.accentSoft,
    shadowColor: colors.accent,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  halo: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(167, 139, 250, 0.45)",
  },
  starWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    fontSize: 44,
    textShadowColor: "rgba(251, 191, 36, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  spark: {
    position: "absolute",
    left: 0,
    top: 0,
    color: colors.accentSoft,
  },
  bloom: {
    position: "absolute",
    left: W * 0.5 - 90,
    top: H * 0.7 - 90,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
  },
});
