# Vault App — expo-video Quirks

## Playback Rate

Use `player.playbackRate` — NOT `player.rate` (wrong property, silently does nothing):

```ts
player.playbackRate = 2.0
```

## Android Surface Type for CSS Transforms

`VideoView` requires `surfaceType="textureView"` on Android for CSS `transform` (e.g., rotation) to work. The default `surfaceView` ignores transforms entirely:

```tsx
<VideoView
  player={player}
  surfaceType="textureView"   // required on Android for rotation transforms
  nativeControls={false}
  contentFit="contain"
/>
```

## Event Subscription Pattern

```ts
const sub = player.addListener('playingChange', (event) => { ... })
// cleanup:
sub.remove()
```

Available events: `'playingChange'`, `'timeUpdate'`, `'playToEnd'`, `'statusChange'`
