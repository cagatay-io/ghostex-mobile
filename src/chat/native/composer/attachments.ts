/**
 * The phone's attachment sources for the composer's paperclip: the photo library, the camera and
 * the Files picker, the same pickers the terminal's attach flow uses
 * (`src/components/terminal/uploads.ts`), plus Paste image for an image on the clipboard (iOS's
 * long-press Paste offers none for a text field). Picked files go to the host's `attachFiles`,
 * which uploads them and has the core insert their reference pills.
 */

import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export type AttachSource = 'library' | 'camera' | 'files' | 'clipboard';

export type PickedFile = { uri: string; name?: string };

function imageName(asset: ImagePicker.ImagePickerAsset, index: number): string | undefined {
  if (typeof asset.fileName === 'string' && asset.fileName.trim().length > 0) return asset.fileName;
  const fromUri = asset.uri.split('?')[0]?.split('/').pop()?.trim() ?? '';
  if (fromUri.length > 0) return fromUri;
  const subtype = asset.mimeType?.startsWith('image/') === true ? asset.mimeType.slice('image/'.length) : 'jpg';
  return `image-${index + 1}.${subtype === 'jpeg' ? 'jpg' : subtype}`;
}

/** Whether the clipboard holds an image; asking does not show iOS's paste prompt. */
export function clipboardHasImage(): Promise<boolean> {
  return Clipboard.hasImageAsync().catch(() => false);
}

/** A pasted image's `data:image/png;base64,…` URI as a PNG in the app's cache, ready to upload. */
export async function savePastedImage(dataUri: string): Promise<PickedFile> {
  const name = `pasted-image-${Date.now()}.png`;
  const file = new File(Paths.cache, name);
  file.create({ intermediates: true, overwrite: true });
  await file.write(dataUri.replace(/^data:[^,]*,/u, ''), { encoding: 'base64' });
  return { uri: file.uri, name };
}

/**
 * The clipboard's image, read directly: Android, and iOS before 16. iOS 16 and later answer null
 * unless the user allows the paste, so there the sheet shows Apple's Paste control instead
 * (`PasteImageRow`).
 */
async function pasteClipboardImage(): Promise<PickedFile[]> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (image === null) throw new Error('There is no image on the clipboard. Copy a screenshot or photo first.');
  return [await savePastedImage(image.data)];
}

/** Opens one picker; resolves the picked files, or `[]` when the user cancelled. */
export async function pickAttachments(source: AttachSource): Promise<PickedFile[]> {
  if (source === 'clipboard') return pasteClipboardImage();
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name }));
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Ghostex needs camera access to take a photo. Turn it on in Settings.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    ...(source === 'library' ? { allowsMultipleSelection: true, selectionLimit: 10 } : {}),
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return (result.assets ?? []).map((asset, index) => {
    const name = imageName(asset, index);
    return name !== undefined ? { uri: asset.uri, name } : { uri: asset.uri };
  });
}
