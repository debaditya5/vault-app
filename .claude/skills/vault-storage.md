# Vault App — Data Storage Layout

## AsyncStorage Keys

| Data | Storage | Key pattern |
|------|---------|-------------|
| Folders list | AsyncStorage | `VAULT_FOLDERS` |
| Media per folder | AsyncStorage | `VAULT_MEDIA_{folderId}` |
| App settings | AsyncStorage | `VAULT_SETTINGS` |
| PIN | expo-secure-store | internal key |
| Media files | File system | `{vaultRoot}/vault/{folderId}/{storedFilename}` |

## Vault Root Resolution (fileService)

Android tries external app-specific storage first (visible in Files app):
```
/storage/emulated/0/Android/data/{pkg}/files/vault/
```
Falls back to `documentDirectory/vault/` if unavailable.

A `.nomedia` file is written to the vault root to block Android gallery indexing.

## Navigation Params

See `src/navigation/RootNavigator.tsx:1` for `RootStackParamList`:
- `Folder: { folder: Folder }`
- `MediaViewer: { items: MediaItem[]; initialIndex: number }`
