# Vault App — Critical Import Notes

## expo-file-system (SDK 54)

Legacy methods (`documentDirectory`, `getInfoAsync`, `copyAsync`, `makeDirectoryAsync`, `deleteAsync`) are deprecated in the main package — use the `/legacy` subpath:

```ts
import * as FileSystem from 'expo-file-system/legacy'
```

New API (Paths, File, Directory) is a separate import:

```ts
import { Paths, File, Directory } from 'expo-file-system'
```

## expo-video

```ts
import { useVideoPlayer, VideoView } from 'expo-video'
```

## ID Generation

No `uuid` package installed, no `react-native-get-random-values`. Use the custom utility:

```ts
import { generateId } from '../utils/generateId'
```

Path is relative — adjust `../` depth based on caller location.
