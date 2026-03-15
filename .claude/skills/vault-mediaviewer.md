# Vault App — MediaViewerScreen Implementation Notes

## Gesture Thresholds (VideoPage PanGestureHandler)

```tsx
activeOffsetX={[-5, 5]}    // activates after ±5px horizontal (keeps slow lazy swipes working)
failOffsetY={[-15, 15]}    // yields on ±15px vertical (lets swipe-down-to-dismiss through; tolerates diagonal drift)
```

These two values are **deliberately tuned together** — tightening either will regress the other behavior.

## Play-Button Flash Suppression After Seek

After a swipe-seek lands (`State.END`), `postSeek` state is set `true` for 400ms.

Play overlay condition:
```ts
!isPlaying && seekInfo === null && !postSeek
```

Without `postSeek`, the player briefly fires `playingChange(false)` while buffering to the new position, causing a visible play-button flash.

## Seek Indicator Styling

- Positioned at bottom of screen: `justifyContent: 'flex-end'`, `paddingBottom: 88` — sits just above the seek bar
- No background (no `backgroundColor`, `borderWidth`, or `borderColor` on the badge)
- Text: `fontWeight: '400'`, 20px delta + 12px target time; text shadows for readability over video

## Controls Auto-Hide

- Controls auto-hide after 3s; timer resets whenever video starts playing
- Tap toggles visibility; while paused, controls stay visible until next play
- `controlsVisible` drives both the bottom bar UI and the status bar (`setStatusBarHidden`)

## Playback Speed Sheet

- Speeds: 0.25×, 0.5×, 1×, 2×, 4×, 8× — accessed via the 3-dot menu
- Rate applied via `player.playbackRate = playbackRate` in a `useEffect`
