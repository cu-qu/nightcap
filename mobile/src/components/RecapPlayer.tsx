import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nightCapPhotoUrl } from "@/src/api/nightcaps";
import { AuthenticatedImage } from "@/src/components/AuthenticatedImage";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";
import type {
  RecapCategoryRollup,
  RecapMoment,
  RecapPhoto,
  RecapSlide,
} from "@/src/types/api";
import { formatQtyLong } from "@/src/utils/calendarStats";
import { formatCurrency, formatDisplayDate } from "@/src/utils/date";

type Props = {
  slides: RecapSlide[];
  onClose: () => void;
};

function formatCategoryValue(category: RecapCategoryRollup): string {
  const amount = Number(category.amount);
  const qty = Number(category.quantity);
  if (category.metric_kind === "amount" && amount) {
    return formatCurrency(amount);
  }
  if (category.metric_kind === "quantity" && qty) {
    return formatQtyLong(qty, category.unit) || `${category.entry_count}×`;
  }
  if (category.entry_count === 1) return "1 night";
  return `${category.entry_count} nights`;
}

function PhotoGrid({ photos }: { photos: RecapPhoto[] }) {
  const { width } = useWindowDimensions();
  const gap = 8;
  const columns = photos.length === 1 ? 1 : 2;
  const tile = (width - 40 - gap * (columns - 1)) / columns;
  const height = columns === 1 ? Math.min(tile * 1.2, 360) : tile;

  return (
    <View style={styles.photoGrid}>
      {photos.map((photo) => (
        <View key={photo.date} style={{ width: tile }}>
          <AuthenticatedImage
            uri={nightCapPhotoUrl(photo.date)}
            style={[styles.photo, { width: tile, height }]}
            accessibilityLabel={
              photo.favorite_moment
                ? `Favorite photo from ${photo.date}: ${photo.favorite_moment}`
                : `Favorite photo from ${photo.date}`
            }
          />
          {photo.favorite_moment ? (
            <Text style={styles.photoCaption} numberOfLines={2}>
              {photo.favorite_moment}
            </Text>
          ) : (
            <Text style={styles.photoCaption}>{formatDisplayDate(photo.date)}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function MomentsList({ moments }: { moments: RecapMoment[] }) {
  return (
    <View style={styles.momentList}>
      {moments.map((moment) => (
        <View key={moment.date} style={styles.momentCard}>
          {moment.has_photo ? (
            <AuthenticatedImage
              uri={nightCapPhotoUrl(moment.date)}
              style={styles.momentPhoto}
              accessibilityLabel={
                moment.text
                  ? `Favorite photo from ${moment.date}: ${moment.text}`
                  : `Favorite photo from ${moment.date}`
              }
            />
          ) : null}
          <View style={styles.momentCopy}>
            <Text style={styles.momentDate}>
              {moment.mood ? `${moment.mood}  ` : ""}
              {formatDisplayDate(moment.date)}
            </Text>
            {moment.text ? (
              <Text style={styles.momentText}>“{moment.text}”</Text>
            ) : (
              <Text style={styles.momentText}>A still from the day.</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function SlideBody({ slide }: { slide: RecapSlide }) {
  const photos = slide.photos ?? [];
  const moments = slide.moments ?? [];
  const moods = slide.moods ?? [];
  const categories = slide.categories ?? [];

  if (slide.type === "moments") {
    const cards =
      moments.length > 0
        ? moments
        : photos.map((photo) => ({
            date: photo.date,
            text: photo.favorite_moment,
            mood: photo.mood,
            has_photo: true,
            photo_url: photo.photo_url,
          }));
    if (cards.length) {
      return <MomentsList moments={cards} />;
    }
  }
  if (slide.type === "photos" && photos.length) {
    return <PhotoGrid photos={photos} />;
  }
  if (slide.type === "moods" && moods.length) {
    return (
      <View style={styles.moodRow}>
        {moods.map((mood) => (
          <View key={mood.mood} style={styles.moodChip}>
            <Text style={styles.moodEmoji}>{mood.mood}</Text>
            <Text style={styles.moodCount}>{mood.count}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (slide.type === "logged" && categories.length) {
    return (
      <View style={styles.loggedList}>
        {slide.expense_total && Number(slide.expense_total) > 0 ? (
          <Text style={styles.loggedSpend}>
            {formatCurrency(Number(slide.expense_total))} spent
          </Text>
        ) : null}
        {categories.map((category) => (
          <View key={`${category.name}-${category.icon}`} style={styles.loggedRow}>
            <Text style={styles.loggedName}>
              {category.emoji ? `${category.emoji}  ` : ""}
              {category.name}
            </Text>
            <Text style={styles.loggedValue}>{formatCategoryValue(category)}</Text>
          </View>
        ))}
      </View>
    );
  }
  return null;
}

export function RecapPlayer({ slides, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const isHero =
    slide?.type === "cover" ||
    slide?.type === "stat" ||
    slide?.type === "season" ||
    slide?.type === "together" ||
    slide?.type === "close";

  const segments = useMemo(
    () => slides.map((_, i) => i <= index),
    [slides, index]
  );

  function go(delta: number) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= slides.length) {
      onClose();
      return;
    }
    setIndex(next);
  }

  if (!slide) return null;

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}
    >
      <View style={styles.topBar}>
        <View style={styles.segments}>
          {segments.map((on, i) => (
            <View key={i} style={[styles.segment, on && styles.segmentOn]} />
          ))}
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Pressable
          style={styles.tapLeft}
          onPress={() => go(-1)}
          accessibilityLabel="Previous"
        />
        <Pressable
          style={isHero ? styles.tapRightHero : styles.tapRight}
          onPress={() => go(1)}
          accessibilityLabel="Next"
        />
        <View style={styles.eyebrowRow} pointerEvents="none">
          {slide.eyebrow ? (
            <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          ) : null}
        </View>
        {slide.stat ? (
          <Text style={styles.stat} pointerEvents="none">
            {slide.stat}
          </Text>
        ) : null}
        {slide.title ? (
          <Text style={[styles.title, isHero && styles.titleHero]}>{slide.title}</Text>
        ) : null}
        {slide.label && slide.stat ? (
          <Text style={styles.label}>{slide.label}</Text>
        ) : null}
        {slide.body ? <Text style={styles.copy}>{slide.body}</Text> : null}

        {isHero ? (
          <SlideBody slide={slide} />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <SlideBody slide={slide} />
          </ScrollView>
        )}
      </View>

      <PrimaryButton
        title={isLast ? "Done" : "Continue"}
        onPress={() => go(1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  segments: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 99,
    backgroundColor: colors.border,
  },
  segmentOn: {
    backgroundColor: colors.accentSoft,
  },
  close: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  body: {
    flex: 1,
    paddingTop: 28,
  },
  tapLeft: {
    position: "absolute",
    left: -20,
    top: 0,
    bottom: 0,
    width: 56,
    zIndex: 2,
  },
  tapRight: {
    position: "absolute",
    right: -20,
    top: 0,
    bottom: 0,
    width: 56,
    zIndex: 2,
  },
  tapRightHero: {
    position: "absolute",
    left: 56,
    right: -20,
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
  eyebrowRow: {
    minHeight: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  stat: {
    marginTop: 18,
    fontSize: 72,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 80,
  },
  title: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  titleHero: {
    fontSize: 40,
    lineHeight: 46,
  },
  label: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  copy: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    color: colors.muted,
  },
  scroll: {
    flex: 1,
    marginTop: 20,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  photoGrid: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photo: {
    borderRadius: 14,
    backgroundColor: colors.elevated,
  },
  photoCaption: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 13,
    color: colors.muted,
  },
  momentList: {
    marginTop: 8,
    gap: 16,
  },
  momentCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  momentPhoto: {
    width: "100%",
    height: 240,
    backgroundColor: colors.surface,
  },
  momentCopy: {
    padding: 16,
  },
  momentDate: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  momentText: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 26,
    color: colors.text,
  },
  moodRow: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  moodChip: {
    minWidth: 72,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  moodEmoji: {
    fontSize: 28,
  },
  moodCount: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  loggedList: {
    marginTop: 20,
    gap: 10,
  },
  loggedSpend: {
    marginBottom: 8,
    fontSize: 18,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  loggedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  loggedName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  loggedValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentSoft,
  },
});
