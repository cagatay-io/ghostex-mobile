/**
 * Screenshots for Send Bug / Feedback: picked from the photo library or pasted from the
 * clipboard, checked against the relay's limits (up to five PNG, JPEG or WebP images of
 * 5 MB each), as the computer's pop-up does.
 */

import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

export const FEEDBACK_MAX_IMAGES = 5;
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface FeedbackImage {
  /** A stable key for the list. */
  id: string;
  name: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  dataBase64: string;
  /** A `data:` URI the thumbnail shows. */
  previewUri: string;
}

let nextImageId = 1;

/** The type, read from the bytes the way the relay checks them, never from the picker. */
function sniffContentType(dataBase64: string): FeedbackImage['contentType'] | null {
  if (dataBase64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (dataBase64.startsWith('/9j/')) return 'image/jpeg';
  // "RIFF" then four size bytes then "WEBP": bytes 8-11 are base64 characters 11-15.
  if (dataBase64.startsWith('UklGR') && dataBase64.slice(11, 16).startsWith('XRUJQ')) return 'image/webp';
  if (dataBase64.startsWith('UklGR') && dataBase64.includes('V0VCU', 8)) return 'image/webp';
  return null;
}

function decodedBytes(dataBase64: string): number {
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  return Math.floor((dataBase64.length * 3) / 4) - padding;
}

/** One screenshot, or the sentence that says why it cannot be attached. */
function feedbackImage(dataBase64: string, number: number): FeedbackImage | string {
  const data = dataBase64.replace(/\s+/g, '');
  const contentType = sniffContentType(data);
  if (!contentType) return `Image ${number} is not a PNG, JPEG or WebP image.`;
  if (decodedBytes(data) > FEEDBACK_IMAGE_MAX_BYTES) return `Image ${number} is larger than 5 MB.`;
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return {
    id: `feedback-image-${nextImageId++}`,
    name: `screenshot-${number}.${extension}`,
    contentType,
    dataBase64: data,
    previewUri: `data:${contentType};base64,${data}`,
  };
}

/** Adds images to `current`, keeping at most five and numbering their names in order. */
function appendImages(
  current: FeedbackImage[],
  dataBase64: string[],
): { images: FeedbackImage[]; error: string | null } {
  const images = [...current];
  let error: string | null = null;
  for (const data of dataBase64) {
    if (images.length >= FEEDBACK_MAX_IMAGES) {
      error = `Attach at most ${FEEDBACK_MAX_IMAGES} images.`;
      break;
    }
    const image = feedbackImage(data, images.length + 1);
    if (typeof image === 'string') error = image;
    else images.push(image);
  }
  return { images, error };
}

/** Renumbers names after a removal, so the issue lists screenshot-1… in order. */
export function withoutImage(current: FeedbackImage[], id: string): FeedbackImage[] {
  return current
    .filter((image) => image.id !== id)
    .map((image, index) => ({ ...image, name: image.name.replace(/^screenshot-\d+/, `screenshot-${index + 1}`) }));
}

/** Opens the photo library for up to the remaining number of screenshots. */
export async function pickFeedbackImages(
  current: FeedbackImage[],
): Promise<{ images: FeedbackImage[]; error: string | null }> {
  const remaining = FEEDBACK_MAX_IMAGES - current.length;
  if (remaining <= 0) return { images: current, error: `Attach at most ${FEEDBACK_MAX_IMAGES} images.` };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    base64: true,
    // Below 1 so iOS hands HEIC photos over as JPEG, which the relay accepts.
    quality: 0.9,
  });
  if (result.canceled) return { images: current, error: null };
  return appendImages(
    current,
    result.assets.map((asset) => asset.base64 ?? '').filter((data) => data.length > 0),
  );
}

/** Pastes the clipboard's image, when it holds one. */
export async function pasteFeedbackImage(
  current: FeedbackImage[],
): Promise<{ images: FeedbackImage[]; error: string | null }> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (!image) return { images: current, error: 'The clipboard has no image to paste.' };
  const data = image.data.replace(/^data:[^;]+;base64,/, '');
  return appendImages(current, [data]);
}
