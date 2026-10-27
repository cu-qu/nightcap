import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_EDGE = 1600;

export type MomentPhotoFile = {
  uri: string;
  name: string;
  type: string;
};

function asFileUri(uri: string): string {
  if (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("data:")
  ) {
    return uri;
  }
  if (uri.startsWith("/")) return `file://${uri}`;
  return uri;
}

/** Rewrite an iPhone photo (often HEIC) into a JPEG the API can store. */
export async function toJpegMomentFile(uri: string): Promise<MomentPhotoFile> {
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: MAX_EDGE,
    maxHeight: MAX_EDGE,
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  return {
    uri: asFileUri(saved.uri),
    name: "moment.jpg",
    type: "image/jpeg",
  };
}
