# Vault App — Architectural Patterns

## 1. Context + Custom Hook Pattern

All three state domains follow the same shape:

```
createContext → Provider component (holds state + logic) → export useXxx() hook
```

- `AuthContext.tsx` → `useAuth()` — authentication, lock state, false mode flag
- `VaultContext.tsx` → `useVault()` — folder/media CRUD, consumes `useAuth()` internally
- `SettingsContext.tsx` → `useSettings()` — user preferences, persisted on every setter call

Provider order in `App.tsx`: `AuthProvider → VaultProvider → SettingsProvider`. VaultContext depends on AuthContext (reads `isFalseMode`); nothing depends on SettingsContext.

Screens never import services directly — all side effects go through context methods.

## 2. Service Layer Abstraction

Three services own all platform I/O:

- `pinService.ts` — only module that touches `expo-secure-store`
- `fileService.ts` — only module that touches `expo-file-system`
- `metadataService.ts` — only module that touches `AsyncStorage`

Context methods call services; services have no knowledge of React state. This makes services independently testable and swappable.

## 3. False Vault / Dual State Pattern

`VaultContext` maintains two parallel state trees:
- `folders` / `mediaByFolder` — persisted real vault data
- `fakeFolders` / `fakeMedia` — ephemeral in-memory decoy data (never written to storage)

Every mutating method begins with an `isFalseMode` guard:
```
if (isFalseMode) { update in-memory fake state; return }
// else: call service + update real state
```

Render path uses: `const displayFolders = isFalseMode || !isAuthenticated ? fakeFolders : folders`

The `!isAuthenticated` condition prevents real data flashing during lock transitions.

## 4. AppState Auto-Lock

`App.tsx` subscribes to React Native's `AppState` change event. On `background` or `inactive`, it calls `lock()` — unless `suppressLock` ref is `true`.

`suppressLock` is toggled by `suppressLock()` / `restoreLock()` on `AuthContext`, called by `useMediaImport` to prevent locking while the system image picker is open (which temporarily backgrounds the app).

## 5. Swipe-to-Select Gesture Pattern

Used in both `HomeScreen.tsx` and `FolderScreen.tsx` for multi-item selection:

1. **Long press** on a card → enter selection mode, select that item
2. **PanResponder** attached to the FlatList container tracks finger position
3. On move: call `FlatList.measureInWindow()` + `getItemLayout()` to map Y coordinate → index → toggle selection
4. A `lastSwipedIndex` ref prevents re-toggling the same item on each move event

Both screens use identical logic; the pattern is not abstracted into a shared hook (duplication accepted for simplicity).

## 6. PIN Entry Flow Pattern

`SetupPinScreen` and `LockScreen` both use:
- `PinDots` — visual indicator (filled/empty circles)
- `PinPad` — 3×4 grid digit pad with delete button
- Local `pin` state string, auto-submits when length reaches 6

`LockScreen` additionally checks the false password from `SettingsContext` and calls `unlockFalse()` vs `unlock()` accordingly.

## 7. Media Import Orchestration

`useMediaImport.ts` is the single hook that owns the full import lifecycle:
1. Check/request permissions → launch picker → extract metadata
2. `suppressLock()` before picker opens, `restoreLock()` in finally block
3. Copy files to vault, build `MediaItem[]`, call `addMediaBatch()`
4. Delete originals from gallery (requires media-library delete permission)

The hook is consumed only by `FolderScreen.tsx`. It is not a general-purpose hook.

## 8. Rotation Without File Mutation

`MediaItem.rotation` stores `0 | 90 | 180 | 270`. Rotation is **never applied to the file** — it is stored in metadata and applied as a CSS transform at render time in `MediaViewerScreen.tsx`.

For 90°/270° rotations, width/height are swapped in the transform calculation to prevent clipping (`src/screens/MediaViewerScreen.tsx` — search `getRotationStyle`).

## 9. Metadata / File Separation

Files live in the sandbox file system. Metadata (filenames, dimensions, durations, order) lives in AsyncStorage. They are linked by `MediaItem.vaultUri` (absolute file path) and `MediaItem.folderId`.

On folder delete: `fileService.deleteFolderContents()` removes files, then `metadataService.removeFolderMetadata()` removes the AsyncStorage key. Both must succeed for a clean delete.

## 10. useMemo / useCallback for Grid Performance

`HomeScreen` and `FolderScreen` use `useMemo` for derived lists (filtered, sorted) and `useCallback` for item renderers. This prevents unnecessary re-renders of grid cells when parent state (e.g., selection set) changes for unrelated items.
