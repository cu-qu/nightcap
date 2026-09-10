import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { nightCapPhotoUrl } from "@/src/api/nightcaps";
import { AuthenticatedImage } from "@/src/components/AuthenticatedImage";
import { colors } from "@/src/theme/colors";

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

type Props = {
  date: string;
  favoriteMoment: string;
  onChangeMoment: (value: string) => void;
  localPhotoUri: string;
  hasRemotePhoto: boolean;
  photoCacheKey: string;
  onPickedPhoto: (file: { uri: string; name: string; type: string }) => void;
  onClearPhoto: () => void;
};

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [4, 5],
  quality: 0.85,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

function fileFromAsset(asset: ImagePicker.ImagePickerAsset): {
  uri: string;
  name: string;
  type: string;
} {
  const type = asset.mimeType || "image/jpeg";
  const ext = type.split("/")[1] === "png" ? "png" : type.split("/")[1] === "webp" ? "webp" : "jpg";
  return {
    uri: asset.uri,
    name: asset.fileName || `moment.${ext}`,
    type,
  };
}

export function RitualMomentsSection({
  date,
  favoriteMoment,
  onChangeMoment,
  localPhotoUri,
  hasRemotePhoto,
  photoCacheKey,
  onPickedPhoto,
  onClearPhoto,
}: Props) {
  const hasPhoto = !!(localPhotoUri || hasRemotePhoto);

  async function launch(source: "library" | "camera") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Allow camera access to capture today’s photo."
          : "Allow photo access to save a favorite still."
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) {
      Alert.alert("Photo too large", "Choose a photo under 8 MB.");
      return;
    }
    onPickedPhoto(fileFromAsset(asset));
  }

  function onPressPhoto() {
    const buttons: {
      text: string;
      onPress?: () => void;
      style?: "cancel" | "destructive" | "default";
    }[] = [
      { text: "Take photo", onPress: () => void launch("camera") },
      { text: "Choose from library", onPress: () => void launch("library") },
    ];
    if (hasPhoto) {
      buttons.push({
        text: "Remove photo",
        style: "destructive",
        onPress: onClearPhoto,
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Favorite photo", "Save a still from today.", buttons);
  }

  const remoteUri = nightCapPhotoUrl(date, photoCacheKey);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Favorite photo</Text>
      <Text style={styles.hint}>One still that made the day yours.</Text>

      <Pressable
        onPress={onPressPhoto}
        style={[styles.photoFrame, hasPhoto && styles.photoFrameFilled]}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? "Change favorite photo" : "Add favorite photo"}
      >
        {localPhotoUri ? (
          <Image source={{ uri: localPhotoUri }} style={styles.photo} resizeMode="cover" />
        ) : hasRemotePhoto ? (
          <AuthenticatedImage
            uri={remoteUri}
            style={styles.photo}
            accessibilityLabel="Favorite photo of the day"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderEmoji}>📷</Text>
            <Text style={styles.placeholderTitle}>Add today’s photo</Text>
            <Text style={styles.placeholderHint}>Camera or library</Text>
          </View>
        )}
      </Pressable>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Favorite moment</Text>
      <Text style={styles.hint}>A line you’ll want to remember.</Text>
      <TextInput
        value={favoriteMoment}
        onChangeText={onChangeMoment}
        placeholder="What was the best part?"
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  hint: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 14,
    color: colors.muted,
  },
  photoFrame: {
    height: 240,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  photoFrameFilled: {
    borderStyle: "solid",
    borderColor: colors.accent,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderEmoji: {
    fontSize: 36,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  placeholderHint: {
    fontSize: 13,
    color: colors.muted,
  },
  input: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
});
