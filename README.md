# Vault

A private, PIN-locked photo and video vault built with React Native and Expo. Store your media securely in the app's sandboxed directory, organized into folders — completely hidden from your device gallery.

## Features

- **PIN protection** — 6-digit PIN stored in iOS Keychain / Android Keystore via `expo-secure-store`. Auto-locks when the app backgrounds.
- **Decoy mode (false vault)** — A separate "false password" opens an empty ephemeral vault, hiding the real contents. The app opens as a "World Time" clock; long-pressing the title reveals the PIN screen.
- **Folders** — Create, rename, delete, and set cover photos for your media folders.
- **Import media** — Pick photos and videos from your gallery; files are copied into the app's private directory and removed from the picker view.
- **Media viewer** — Swipe horizontally through media, with a back button and swipe-down-to-close gesture.
- **Video playback** — Native video player with play/pause, a draggable seek bar, and current/total time display.
- **Video thumbnails** — Auto-generated thumbnails with duration badge in the folder grid.
- **Rotation** — Rotate photos and videos 90° at a time without cropping.
- **Slideshow** — Auto-advance slideshow with configurable slide duration (2s / 3s / 4s / 5s / 10s).
- **Sort & Filter** — Sort by date or name; filter by media type (photos/videos) or search by name.
- **Swipe-to-select** — Long-press to enter selection mode, then drag to bulk-select items for delete/move.
- **Unhide** — Save any vaulted item back to your device gallery.
- **Move** — Move media items between folders.
- **Share** — Share any photo or video directly from the viewer.
- **Storage stats** — See folder count, total items, and space used in Settings.

## Tech Stack

| Library | Purpose |
|---|---|
| Expo SDK 54 | Managed workflow, build tooling |
| React Navigation (Stack + Tabs) | Navigation |
| `expo-secure-store` | PIN storage (Keychain/Keystore) |
| `expo-file-system` | Copy/move/delete files in sandboxed storage |
| `expo-image-picker` | Media selection from gallery |
| `expo-video` | Video playback (migrated from deprecated expo-av) |
| `expo-video-thumbnails` | Video thumbnail generation |
| `expo-media-library` | Save media back to device gallery |
| `@react-native-async-storage/async-storage` | Folder & media metadata persistence |

## Project Structure

```
vault-app/
├── App.tsx                        # Root: providers + AppState lock listener
├── app.json                       # Expo config, permissions, plugins
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx      # Stack navigator (Splash → Lock → Home → Folder → Viewer)
│   │   └── MainTabs.tsx           # Bottom tabs (Home + Settings)
│   ├── context/
│   │   ├── AuthContext.tsx        # Authentication state, lock/unlock, false mode, suppress-lock
│   │   ├── VaultContext.tsx       # Folders & media CRUD, move, rotate, cover; dual real/false vault state
│   │   └── SettingsContext.tsx    # Persisted settings (slideshow interval, long-press delay, false password)
│   ├── screens/
│   │   ├── SplashScreen.tsx       # Decoy "World Time" clock; long-press title → PIN screen
│   │   ├── LockScreen.tsx         # PIN entry with lockout timer (5 attempts → 30s)
│   │   ├── SetupPinScreen.tsx     # First-run PIN creation + confirmation
│   │   ├── ChangePinScreen.tsx    # Change existing PIN (3-step: verify → new → confirm)
│   │   ├── HomeScreen.tsx         # Folder grid with swipe-to-select + bulk ops
│   │   ├── FolderScreen.tsx       # Media grid with sort/filter + swipe-to-select
│   │   ├── MediaViewerScreen.tsx  # Full-screen photo/video viewer, seek bar, slideshow
│   │   └── SettingsScreen.tsx     # Security, slideshow, long-press delay, storage stats
│   ├── components/
│   │   ├── pin/PinPad.tsx         # 3×4 digit grid
│   │   ├── pin/PinDots.tsx        # PIN dot indicator with shake animation
│   │   ├── folder/FolderCard.tsx  # Folder thumbnail card
│   │   ├── folder/CreateFolderModal.tsx
│   │   ├── folder/FolderActionsSheet.tsx
│   │   ├── media/MediaThumbnail.tsx     # Thumbnail with video overlay + duration badge
│   │   ├── media/MediaActionsSheet.tsx
│   │   ├── media/MediaPickerModal.tsx   # Native gallery picker UI
│   │   └── common/OnboardingModal.tsx   # First-run onboarding shown in SplashScreen
│   ├── services/
│   │   ├── pinService.ts          # SecureStore: save, verify, check PIN
│   │   ├── fileService.ts         # FileSystem: copy, move, delete vault files; Android external storage fallback
│   │   └── metadataService.ts     # AsyncStorage: load/save folders & media
│   ├── hooks/
│   │   └── useMediaImport.ts      # Orchestrates picker → URI resolution → copy → context update
│   ├── types/index.ts
│   └── utils/generateId.ts
```

## Getting Started

### Prerequisites

- Node.js 22+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- EAS CLI (`npm install -g eas-cli`) — for production builds
- Physical device recommended (simulator has no real media library)

### Install

```bash
git clone https://github.com/debaditya5/vault-app.git
cd vault-app
npm install
```

### Run

> **Expo Go will not work.** This app uses native plugins (`expo-secure-store`, `expo-video`, `expo-media-library`, `expo-image-picker`) that require a **development build**. The dev server emits an `exp+vault-app://` scheme QR code that Expo Go cannot open.

**Step 1 — Build and install the dev client** (one-time per device/simulator):

```bash
npx expo run:ios       # iOS simulator or connected iPhone
npx expo run:android   # Android emulator or connected device
```

**Step 2 — Start the dev server** (subsequent runs):

```bash
npx expo start
```

Scan the QR code with the **Vault dev client** that was installed in Step 1 (not Expo Go).

## CI/CD — Tag-based Builds

Builds are **not triggered on every commit**. The pipeline runs only when:

1. **A version tag is pushed** — format `v*` (e.g. `v1.0.0`, `v1.2.3`)
2. **Manually dispatched** via the GitHub Actions UI (choose `preview` or `production` profile)

### Releasing a new build

```bash
# Commit and push your changes normally — no build is triggered
git add .
git commit -m "feat: my new feature"
git push

# When ready to distribute, create and push a version tag
git tag v1.2.0
git push origin v1.2.0   # ← this triggers the build
```

### Pipeline steps

1. Checkout + `npm ci`
2. EAS local build → `TimeMatrix.apk` (Android `preview` profile by default)
3. Upload to **Firebase App Distribution** with release notes showing the tag + commit SHA

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `EXPO_TOKEN` | Expo account token (account settings on expo.dev) |
| `FIREBASE_APP_ID` | Firebase app ID from the Firebase console |
| `FIREBASE_TOKEN` | Firebase CI token (`firebase login:ci`) |

### EAS Build Profiles (`eas.json`)

| Profile | Output | Use case |
|---|---|---|
| `development` | Internal distribution (dev client) | Local dev with Expo Dev Client |
| `preview` | APK, internal distribution | Testers via Firebase App Distribution |
| `production` | AAB, auto-increment version | Play Store submission |

## Security Notes

- The PIN is never stored in AsyncStorage — only in the OS secure enclave (`expo-secure-store`).
- All media files are stored in the app's sandboxed directory (inaccessible to other apps). On Android, the app first tries external app-specific storage (`/Android/data/{pkg}/files/vault/`) for Files app visibility, falling back to internal `documentDirectory`.
- A `.nomedia` file is placed in the vault root to prevent the system gallery scanner from indexing vault contents.
- The vault auto-locks whenever the app moves to the background.
- The false password opens an ephemeral decoy vault with no real data — contents are never persisted and reset each session.
