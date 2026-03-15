# Vault App — Build & Run Commands

> **Expo Go will NOT work.** Native plugins (`expo-secure-store`, `expo-video`, `expo-media-library`, `expo-image-picker`) require a **development build**. The dev server generates an `exp+vault-app://` scheme QR that Expo Go cannot open.

## Dev Server

```bash
cd vault-app
npx expo start              # Start dev server (requires dev client on device)
npx expo start --ios        # iOS simulator (requires dev client)
npx expo start --android    # Android emulator (requires dev client)
npx tsc --noEmit            # Type-check only (no test suite configured)
```

## First-Time Dev Client Setup

Build and install the dev client once per device/simulator — after that, `npx expo start` QR opens in the dev client app.

```bash
npx expo run:ios            # Build & install on iOS simulator or connected device
npx expo run:android        # Build & install on Android emulator or connected device
```
