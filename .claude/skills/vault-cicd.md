# Vault App — CI/CD

## Pipeline

- **Workflow file:** `.github/workflows/build.yml`
- **Trigger:** tag push (`v*`) or manual dispatch — NOT on every commit to main
- **Pipeline:** EAS local build (Android APK, `preview` profile) → Firebase App Distribution

## Releasing

```bash
git tag v1.x.x && git push origin v1.x.x
```

## Manual Dispatch

Supports profile selection via `workflow_dispatch` input: `preview` or `production`.

## Required Secrets

| Secret | Purpose |
|--------|---------|
| `EXPO_TOKEN` | EAS authentication |
| `FIREBASE_APP_ID` | Firebase App Distribution target |
| `FIREBASE_TOKEN` | Firebase CLI auth |
