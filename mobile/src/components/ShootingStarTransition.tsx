import { useEffect, useMemo } from "react";
import { Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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

type Track = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ux: number;
  uy: number;
  angle: number;
  /** Progress when the head reaches the screen edge, and when it leaves. */
  enter: number;
  exit: number;
  sparks: readonly number[];
};

const FLY_MS = 1240;
const LEAD_MS = 90;
const HOLD_MS = 240;
const FADE_MS = 320;

/** How far the path is extended so the whole tail can enter and leave. */
const PATH_PAD = 250;
const TAIL_COUNT = 26;
const TAIL_LEN = 200;
const PIECE_LEN = 22;

const SPARK_AT = [0.22, 0.4, 0.58, 0.76] as const;
const TAIL_INDEXES = Array.from({ length: TAIL_COUNT }, (_, i) => TAIL_COUNT - 1 - i);

const FIELD = [
  { x: 0.08, y: 0.07, s: 2 },
  { x: 0.18, y: 0.14, s: 1.5 },
  { x: 0.33, y: 0.06, s: 2 },
  { x: 0.52, y: 0.11, s: 1.5 },
  { x: 0.67, y: 0.05, s: 2.5 },
  { x: 0.8, y: 0.13, s: 1.5 },
  { x: 0.92, y: 0.08, s: 2 },
  { x: 0.12, y: 0.24, s: 1.5 },
  { x: 0.86, y: 0.22, s: 2 },
  { x: 0.42, y: 0.2, s: 1.5 },
  { x: 0.22, y: 0.78, s: 2 },
  { x: 0.58, y: 0.84, s: 1.5 },
  { x: 0.74, y: 0.72, s: 2 },
  { x: 0.38, y: 0.9, s: 1.5 },
] as const;

/**
 * Straight diagonal at constant speed. The path starts and ends far enough
 * off screen that the tail is already full length when it appears.
 */
export function buildCometTrack(width: number, height: number): Track {
  const xStart = -18;
  const yStart = height * 0.11;
  const xEnd = width + 18;
  const yEnd = height * 0.36;
  const dx = xEnd - xStart;
  const dy = yEnd - yStart;
  const visual = Math.hypot(dx, dy) || 1;
  const ux = dx / visual;
  const uy = dy / visual;
  const exitPad = 36;
  const x0 = xStart - ux * PATH_PAD;
  const y0 = yStart - uy * PATH_PAD;
  const x1 = xEnd + ux * (PATH_PAD + exitPad);
  const y1 = yEnd + uy * (PATH_PAD + exitPad);
  const total = visual + PATH_PAD * 2 + exitPad;
  const enter = PATH_PAD / total;
  const exit = (PATH_PAD + visual) / total;
  return {
    x0,
    y0,
    x1,
    y1,
    ux,
    uy,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    enter,
    exit,
    sparks: SPARK_AT.map((f) => enter + (exit - enter) * f),
  };
}

export function headAt(track: Track, t: number) {
  "worklet";
  return {
    x: track.x0 + (track.x1 - track.x0) * t,
    y: track.y0 + (track.y1 - track.y0) * t,
  };
}

/** Center of a streak whose leading tip sits on the head. */
export function streakCenter(track: Track, t: number, length: number) {
  "worklet";
  const head = headAt(track, t);
  return {
    x: head.x - track.ux * (length / 2),
    y: head.y - track.uy * (length / 2),
  };
}

function TailBit({
  progress,
  track,
  index,
}: {
  progress: SharedValue<number>;
  track: Track;
  index: number;
}) {
  const fade = 1 - index / (TAIL_COUNT - 1);
  const behind = (index / (TAIL_COUNT - 1)) * TAIL_LEN + PIECE_LEN / 2;
  const glowT = 3.2 + fade * 8;
  const coreT = 1.25 + fade * 2.5;

  const glow = useAnimatedStyle(() => {
    const head = headAt(track, progress.value);
    const x = head.x - track.ux * behind;
    const y = head.y - track.uy * behind;
    return {
      transform: [
        { translateX: x - PIECE_LEN / 2 },
        { translateY: y - glowT / 2 },
        { rotate: `${track.angle}deg` },
      ],
    };
  });

  const core = useAnimatedStyle(() => {
    const head = headAt(track, progress.value);
    const x = head.x - track.ux * behind;
    const y = head.y - track.uy * behind;
    return {
      transform: [
        { translateX: x - PIECE_LEN / 2 },
        { translateY: y - coreT / 2 },
        { rotate: `${track.angle}deg` },
      ],
    };
  });

  return (
    <>
      <Animated.View
        style={[
          styles.streak,
          {
            width: PIECE_LEN,
            height: glowT,
            borderRadius: glowT / 2,
            backgroundColor: "rgba(139, 92, 246, 0.95)",
            opacity: fade * 0.16,
          },
          glow,
        ]}
      />
      <Animated.View
        style={[
          styles.streak,
          {
            width: PIECE_LEN,
            height: coreT,
            borderRadius: coreT / 2,
            backgroundColor: "#EDE7FF",
            opacity: fade * 0.92,
          },
          core,
        ]}
      />
    </>
  );
}

function HotStreak({
  progress,
  track,
}: {
  progress: SharedValue<number>;
  track: Track;
}) {
  const length = 42;
  const thickness = 2;
  const style = useAnimatedStyle(() => {
    const center = streakCenter(track, progress.value, length);
    return {
      transform: [
        { translateX: center.x - length / 2 },
        { translateY: center.y - thickness / 2 },
        { rotate: `${track.angle}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.streak,
        {
          width: length,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: "#FFF8EE",
        },
        style,
      ]}
    />
  );
}

function Head({
  progress,
  track,
  size,
  color,
  pull,
}: {
  progress: SharedValue<number>;
  track: Track;
  size: number;
  color: string;
  pull: number;
}) {
  const style = useAnimatedStyle(() => {
    const head = headAt(track, progress.value);
    const x = head.x - track.ux * pull;
    const y = head.y - track.uy * pull;
    return {
      transform: [
        { translateX: x - size / 2 },
        { translateY: y - size / 2 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.streak,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function StarHead({
  progress,
  track,
}: {
  progress: SharedValue<number>;
  track: Track;
}) {
  const style = useAnimatedStyle(() => {
    const head = headAt(track, progress.value);
    return {
      transform: [
        { translateX: head.x - 12 },
        { translateY: head.y - 12 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.starBox, style]}>
      <View
        style={[
          styles.ray,
          styles.rayLong,
          { transform: [{ rotate: `${track.angle}deg` }] },
        ]}
      />
      <View
        style={[
          styles.ray,
          styles.rayShort,
          { transform: [{ rotate: `${track.angle + 90}deg` }] },
        ]}
      />
      <View style={styles.coreDot} />
    </Animated.View>
  );
}

function Spark({
  progress,
  track,
  born,
  side,
}: {
  progress: SharedValue<number>;
  track: Track;
  born: number;
  side: number;
}) {
  const style = useAnimatedStyle(() => {
    const origin = headAt(track, born);
    const t = progress.value;
    if (t < born) {
      return {
        opacity: 0,
        transform: [
          { translateX: origin.x - 2 },
          { translateY: origin.y - 2 },
        ],
      };
    }
    const life = Math.min(1, (t - born) / 0.16);
    const along = life * 18;
    const across = life * 8 * side;
    const x = origin.x - track.ux * along - track.uy * across;
    const y = origin.y - track.uy * along + track.ux * across;
    const fadeIn = life < 0.18 ? life / 0.18 : 1;
    const fadeOut = 1 - Math.max(0, life - 0.18) / 0.82;
    return {
      opacity: fadeIn * fadeOut * 0.75,
      transform: [
        { translateX: x - 2 },
        { translateY: y - 2 },
      ],
    };
  });

  return <Animated.View style={[styles.spark, style]} />;
}

function FieldDot({
  sky,
  x,
  y,
  size,
  phase,
}: {
  sky: SharedValue<number>;
  x: number;
  y: number;
  size: number;
  phase: number;
}) {
  const style = useAnimatedStyle(() => {
    const fade = Math.min(1, sky.value / 0.22);
    const wave = 0.5 + 0.5 * Math.sin((sky.value + phase) * Math.PI * 2);
    return { opacity: fade * (0.16 + 0.5 * wave) };
  });

  return (
    <Animated.View
      style={[
        styles.fieldDot,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size,
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
  const { width, height } = useWindowDimensions();
  const track = useMemo(
    () => buildCometTrack(Math.max(width, 1), Math.max(height, 1)),
    [width, height]
  );
  const progress = useSharedValue(0);
  const veil = useSharedValue(0);
  const sky = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      veil.value = 0;
      sky.value = 0;
      return;
    }

    progress.value = 0;
    veil.value = 0;
    sky.value = 0;
    veil.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    sky.value = withTiming(1, { duration: 1700, easing: Easing.linear });
    progress.value = withDelay(
      LEAD_MS,
      withTiming(1, { duration: FLY_MS, easing: Easing.linear })
    );

    const midAt = LEAD_MS + ((track.enter + track.exit) / 2) * FLY_MS;
    const midTimer = setTimeout(() => {
      onTransition?.();
    }, midAt);

    const endTimer = setTimeout(() => {
      veil.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onFinished)();
      });
    }, LEAD_MS + FLY_MS + HOLD_MS);

    return () => {
      clearTimeout(midTimer);
      clearTimeout(endTimer);
    };
  }, [visible, onTransition, onFinished, progress, veil, sky, track]);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
  }));

  const captionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - veil.value) * 8 }],
  }));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[styles.root, veilStyle]}
        pointerEvents="none"
        collapsable={false}
      >
        {FIELD.map((dot, i) => (
          <FieldDot
            key={i}
            sky={sky}
            x={width * dot.x}
            y={height * dot.y}
            size={dot.s}
            phase={i / FIELD.length}
          />
        ))}

        <Animated.View
          style={[styles.captionWrap, { top: height * 0.57 }, captionStyle]}
        >
          <Text style={styles.caption}>NightCap saved</Text>
          <Text style={styles.captionSub}>Sweet dreams</Text>
        </Animated.View>

        {TAIL_INDEXES.map((index) => (
          <TailBit key={index} progress={progress} track={track} index={index} />
        ))}
        <HotStreak progress={progress} track={track} />
        <Head
          progress={progress}
          track={track}
          size={28}
          color="rgba(167, 139, 250, 0.22)"
          pull={2}
        />
        <Head
          progress={progress}
          track={track}
          size={16}
          color="rgba(237, 228, 255, 0.55)"
          pull={0}
        />
        <StarHead progress={progress} track={track} />

        {track.sparks.map((born, i) => (
          <Spark
            key={born}
            progress={progress}
            track={track}
            born={born}
            side={i % 2 === 0 ? 1 : -1}
          />
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fieldDot: {
    position: "absolute",
    backgroundColor: "#F4EEFF",
  },
  captionWrap: {
    position: "absolute",
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
  streak: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  spark: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E4D4FF",
  },
  starBox: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 24,
    height: 24,
  },
  ray: {
    position: "absolute",
    top: 11.25,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "#FFF8EE",
  },
  rayLong: {
    width: 15,
    left: 4.5,
  },
  rayShort: {
    width: 8,
    left: 8,
  },
  coreDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    left: 9.5,
    top: 9.5,
    backgroundColor: "#FFFFFF",
  },
});
