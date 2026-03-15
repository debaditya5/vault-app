# Vault App — False Vault (Decoy Mode)

## Entry Point

`SplashScreen` shows a "World Time" clock. Long-pressing the title (duration configurable via `longPressDelay` in `SettingsContext`) navigates to `LockScreen`.

## False Password

- Separate from the real PIN
- Stored in `SettingsContext` as `falsePassword` (default `'123456'`)
- Entering it on `LockScreen` calls `unlockFalse()` in `AuthContext`, which sets `isFalseMode = true`

## VaultContext Behavior in False Mode

When `isFalseMode || !isAuthenticated`, all reads return ephemeral `fakeFolders`/`fakeMedia` state. Every mutating method has a guard:

```ts
if (isFalseMode) {
  // update in-memory fake state only
  return
}
// else: call service + update real state
```

Nothing is ever persisted in false mode. The `!isAuthenticated` condition prevents real data from flashing during lock transitions.

## Legacy Migration

`SettingsContext` auto-corrects the old default false password on load:
```
'000000' → '123456'
```
