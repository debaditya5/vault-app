# Vault App

A React Native mobile app for securely storing private photos and videos behind PIN authentication with a "false vault" decoy mode.

## Tech Stack

- **React Native** 0.81.5 + **Expo SDK 54** (managed workflow), TypeScript strict mode
- **Navigation:** react-navigation v7 (stack + bottom tabs)
- **Storage:** AsyncStorage (metadata), expo-secure-store (PIN), expo-file-system (files)
- **Media:** expo-image-picker, expo-media-library, expo-video, expo-video-thumbnails
- **Target:** iOS + Android, portrait-only, dark theme

## Project Structure

```
./
├── App.tsx                  # Provider chain + AppState lock listener
├── src/
│   ├── navigation/          # RootNavigator (auth flow) + MainTabs (home/settings)
│   ├── context/             # AuthContext, VaultContext, SettingsContext
│   ├── screens/             # 8 screens: Splash, Lock, SetupPin, ChangePin, Home, Folder, MediaViewer, Settings
│   ├── components/          # pin/, folder/, media/, common/ subfolders
│   ├── services/            # pinService, fileService, metadataService
│   ├── hooks/               # useMediaImport
│   ├── types/               # index.ts (Folder, MediaItem interfaces)
│   └── utils/               # generateId.ts
```

## Key Files

- `src/types/index.ts:1` — `Folder` and `MediaItem` type definitions
- `src/context/AuthContext.tsx` — authentication state, lock/unlock, false mode, `suppressLock`/`restoreLock`
- `src/context/VaultContext.tsx` — all CRUD for folders and media; dual real/false vault state
- `src/context/SettingsContext.tsx` — `slideshowInterval`, `longPressDelay`, `falsePassword` (persisted to `VAULT_SETTINGS`)
- `src/screens/SplashScreen.tsx` — decoy "World Time" clock; long-press title → LockScreen
- `src/services/fileService.ts` — file copy/move/delete; Android tries external storage first, falls back to `documentDirectory`
- `src/services/metadataService.ts` — AsyncStorage persistence layer
- `src/hooks/useMediaImport.ts` — full import orchestration (resolve URI → copy → metadata → context)

## Available Skills

Use these slash commands for on-demand context (files live in `.claude/skills/"):

| Skill | Topic |
|---------|-------|
| `/vault-build` | Build & run commands, dev client setup |
| `/vault-imports` | Critical import paths (file-system/legacy, expo-video, generateId) |
| `/vault-storage` | AsyncStorage keys, file path layout, Android vault root |
| `/vault-cicd` | CI/CD release workflow, secrets, tag-based triggers |
| `/vault-false-vault` | False vault / decoy mode entry, state, migration |
| `/vault-video` | expo-video quirks (playbackRate, surfaceType) |
| `/vault-mediaviewer` | MediaViewerScreen: gestures, seek, controls, speed |
| `/vault-architecture` | Architectural patterns: context/hook, service layer, dual state, etc. |
