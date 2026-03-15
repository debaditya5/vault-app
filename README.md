# Vault

A private, PIN-locked photo and video vault built with React Native and Expo. Store your media securely in the app's sandboxed directory, organized into folders — completely hidden from your device gallery.

## Features

- **PIN protection** — 6-digit PIN stored in iOS Keychain / Android Keystore via `expo-secure-store`. Auto-locks when the app backgrounds.
- **Decoy mode (false vault)** — A separate "false password" opens an empty ephemeral vault, hiding the real contents. The app presents as a "World Time" clock; long-pressing the title reveals the PIN screen.
- **Folders** — Create, rename, delete, and set cover photos for your media folders.
- **Import media** — Pick photos and videos from your gallery; files are copied into the app's private directory and removed from the picker view.
- **Native filename search** — Queries the OS media database (Android `MediaStore` / iOS `PHFetchOptions`) directly for instant search across thousands of files — same approach used by MX Player.
- **Media viewer** — Full-screen photo/video viewer. Swipe horizontally to navigate; swipe down to close. Tap to show/hide controls (auto-hides after 3s during playback).
- **Video playback** — Native player with play/pause, scrub-to-seek, draggable seek bar, auto-hiding controls, and speed selection (0.25× – 8×).
- **Video thumbnails** — Auto-generated thumbnails with duration badge, concurrent generation (max 4 simultaneous), session-level cache.
- **Rotation** — Rotate photos and videos 90° at a time without cropping. MP4 rotation is applied by patching the `tkhd` matrix directly.
- **Slideshow** — Auto-advance slideshow with configurable interval (2s / 3s / 4s / 5s / 10s).
- **Sort & Filter** — Sort by date or name; filter by media type (photos/videos).
- **Swipe-to-select** — Long-press to enter selection mode, then drag to bulk-select for delete/move.
- **Unhide** — Export any vaulted item back to your device gallery.
- **Move** — Move media between folders.
- **Storage stats** — Folder count, total items, and space used shown in Settings.

## Tech Stack

| Library | Purpose |
|---|---|
| Expo SDK 54 | Managed workflow, build tooling |
| React Native 0.81.5 | Framework |
| React Navigation v7 (Stack + Tabs) | Navigation |
| `expo-secure-store` | PIN storage (Keychain/Keystore) |
| `expo-file-system` | Copy/move/delete files in sandboxed storage |
| `expo-image-picker` | Media selection from gallery |
| `expo-video` | Video playback |
| `expo-video-thumbnails` | Video thumbnail generation |
| `expo-media-library` | Save media back to device gallery |
| `@react-native-async-storage/async-storage` | Folder & media metadata persistence |
| `modules/media-search` | Local native module — direct `MediaStore`/`PHFetchOptions` search |

## Project Structure

```
vault-app/
├── App.tsx                        # Root: provider chain + AppState lock listener
├── app.json                       # Expo config, permissions, plugins
├── eas.json                       # EAS Build profiles (development / preview / production)
├── index.ts                       # React Native entry point
├── modules/
│   └── media-search/              # Native filename search module
│       ├── index.ts               # JS entry — exports searchAssets()
│       ├── expo-module.config.json
│       ├── android/               # Kotlin — queries MediaStore with LIKE filter
│       └── ios/                   # Swift — queries PHFetchOptions with NSPredicate
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx      # Stack navigator (Splash → Lock → Home → Folder → Viewer)
│   │   └── MainTabs.tsx           # Bottom tabs (Home + Settings)
│   ├── context/
│   │   ├── AuthContext.tsx        # Auth state, lock/unlock, false mode, suppress-lock
│   │   ├── VaultContext.tsx       # Folders & media CRUD; dual real/false vault state
│   │   └── SettingsContext.tsx    # Persisted settings (slideshow interval, long-press delay, false password)
│   ├── screens/
│   │   ├── SplashScreen.tsx       # Decoy "World Time" clock; long-press title → PIN screen
│   │   ├── LockScreen.tsx         # PIN entry with lockout (5 attempts → 30s)
│   │   ├── SetupPinScreen.tsx     # First-run PIN creation + confirmation
│   │   ├── ChangePinScreen.tsx    # Change PIN (3-step: verify → new → confirm)
│   │   ├── HomeScreen.tsx         # Folder grid with swipe-to-select + bulk ops
│   │   ├── FolderScreen.tsx       # Media list with sort/filter + swipe-to-select
│   │   ├── MediaViewerScreen.tsx  # Full-screen viewer; seek, speed control, slideshow
│   │   └── SettingsScreen.tsx     # Security, playback, decoy, storage stats
│   ├── components/
│   │   ├── pin/PinPad.tsx         # 3×4 digit grid
│   │   ├── pin/PinDots.tsx        # PIN dot indicator with shake animation
│   │   ├── folder/FolderCard.tsx  # Folder thumbnail card
│   │   ├── folder/CreateFolderModal.tsx
│   │   ├── folder/FolderActionsSheet.tsx
│   │   ├── media/MediaThumbnail.tsx      # Thumbnail with video overlay + duration badge
│   │   ├── media/MediaActionsSheet.tsx
│   │   ├── media/MediaPickerModal.tsx    # Album browser + native search + lazy thumbnails
│   │   ├── common/OnboardingModal.tsx    # First-run onboarding
│   │   └── common/ConfirmDialog.tsx      # Reusable confirmation dialog
│   ├── services/
│   │   ├── pinService.ts          # SecureStore: save, verify, check PIN
│   │   ├── fileService.ts         # FileSystem: copy, move, delete; Android external storage fallback
│   │   └── metadataService.ts     # AsyncStorage: load/save folders & media metadata
│   ├── hooks/
│   │   └── useMediaImport.ts      # Orchestrates picker → URI resolve → copy → context update
│   ├── types/index.ts             # Folder, MediaItem, VaultState interfaces
│   └── utils/
│       ├── formatBytes.ts         # Shared formatBytes() and formatDuration() utilities
│       ├── generateId.ts          # Timestamp-based unique ID generator
│       └── applyExportRotation.ts # Patches MP4 tkhd matrix for video rotation on export
```

## Getting Started

### Prerequisites

- Node.js 22+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- EAS CLI — `npm install -g eas-cli` (for builds)
- Physical Android device recommended (simulators have no real media library)

### Install

```bash
git clone https://github.com/debaditya5/vault-app.git
cd vault-app
npm install
```

### Dev server (JS-only changes)

```bash
npx expo start
```

Scan the QR code with the **Vault dev client** app installed on your device (not Expo Go — native plugins are required).

> **Note:** The native search module (`modules/media-search`) only activates in a build that includes the compiled native code. On the current dev client it falls back to a JS-based scan automatically.

## CI/CD — Tag-based Builds

Builds are **not triggered on every commit**. The pipeline runs only when:

1. **A version tag is pushed** — format `v*` (e.g. `v1.0.0`, `v1.2.3`)
2. **Manually dispatched** via the GitHub Actions UI (choose `preview` or `production` profile)

### Releasing a new build

```bash
# Commit and push your changes — no build triggered
git add .
git commit -m "feat: my new feature"
git push

# When ready to distribute, tag and push
git tag v1.2.0
git push origin v1.2.0   # ← triggers EAS build + Firebase distribution
```

### Pipeline

1. Checkout + `npm ci`
2. `npx expo prebuild` — generates native Android/iOS projects (including the `media-search` module)
3. EAS local build → `TimeMatrix.apk` (Android `preview` profile by default)
4. Upload to **Firebase App Distribution**

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `EXPO_TOKEN` | Expo account token (expo.dev account settings) |
| `FIREBASE_APP_ID` | Firebase app ID from the Firebase console |
| `FIREBASE_TOKEN` | Firebase CI token (`firebase login:ci`) |

### EAS Build Profiles (`eas.json`)

| Profile | Output | Use case |
|---|---|---|
| `development` | Dev client APK | Install once; use with `expo start` for dev |
| `preview` | APK, internal distribution | Testers via Firebase App Distribution |
| `production` | AAB, auto-increment version | Play Store submission |

## Security Notes

- The PIN is never stored in AsyncStorage — only in the OS secure enclave via `expo-secure-store`.
- All media is stored in the app's sandboxed directory (inaccessible to other apps). On Android, the app tries external app-specific storage (`/Android/data/{pkg}/files/vault/`) first for Files app visibility, falling back to internal `documentDirectory`.
- A `.nomedia` file is placed in the vault root to prevent the system gallery scanner from indexing vault contents.
- The app auto-locks whenever it moves to the background.
- The false password opens an ephemeral decoy vault — its contents are never persisted and reset each session.
