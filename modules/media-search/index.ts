import { requireNativeModule } from 'expo-modules-core';

export interface NativeAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video';
  /** Duration in seconds (0 for photos) */
  duration: number;
  creationTime: number;
  width: number;
  height: number;
}

export interface SearchOptions {
  /** expo-media-library album id. Pass null to search all media. */
  albumId: string | null;
  query: string;
  mediaType?: 'all' | 'photo' | 'video';
  /** Max results to return. Default 500. */
  limit?: number;
}

let _module: { searchAssets: (albumId: string | null, query: string, mediaType: string, limit: number) => Promise<NativeAsset[]> } | null = null;

try {
  _module = requireNativeModule('MediaSearch');
} catch {
  // Native module not available (Expo Go or prebuild not run yet)
  _module = null;
}

/**
 * True once `npx expo prebuild` has been run and you're on a dev/prod build.
 */
export const isAvailable = _module !== null;

/**
 * Query the OS media database directly — same path as MX Player.
 * Returns instantly from the system's already-indexed MediaStore / PHPhotos DB.
 */
export async function searchAssets(options: SearchOptions): Promise<NativeAsset[]> {
  if (!_module) {
    throw new Error(
      'media-search native module not available. Run `npx expo prebuild` and rebuild the dev client.'
    );
  }
  return _module.searchAssets(
    options.albumId ?? null,
    options.query,
    options.mediaType ?? 'all',
    options.limit ?? 500,
  );
}
