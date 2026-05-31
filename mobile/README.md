# Luma Mobile

Initial React Native / Expo mobile client for Luma. This is intentionally small: it sets up the native app shell, bottom tabs, a static habit-first Today screen, placeholder tabs, a shared theme, and an API client placeholder.

The existing Vite web app in `../web` and the existing API in `../SimpleFlashCards.Api` are not changed by this mobile app.

## Install

From the repo root:

```bash
cd mobile
npm install
```

## Start Expo

```bash
npx expo start
```

This opens the Expo dev tools in the terminal and prints a QR code.

## Expo Go

1. Install Expo Go from the iOS App Store or Google Play.
2. Run `npx expo start` from `mobile/`.
3. Scan the QR code:
   - iPhone: use the Camera app or Expo Go.
   - Android: use Expo Go.

If Expo Go reports an SDK version mismatch, install the current Expo Go build from `https://expo.dev/go` and try again. Expo's App Store / Play Store availability can lag right after a new SDK release.

If the phone cannot reach your computer on the local network, use tunnel mode:

```bash
npx expo start --tunnel
```

## iOS Simulator

On macOS with Xcode installed:

```bash
npx expo start --ios
```

You can also start Expo with `npx expo start` and press `i`.

## Android Emulator

With Android Studio and an emulator running:

```bash
npx expo start --android
```

You can also start Expo with `npx expo start` and press `a`.

## API Base URL

The placeholder API client lives in `src/services/appApi.ts`.

Default local API base URL:

```text
http://localhost:5057
```

You can override it with:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:5057 npx expo start
```

Device notes:

- Web/local computer: `http://localhost:5057`
- Physical phone: use your computer LAN IP, for example `http://192.168.x.x:5057`
- Android Emulator: use `http://10.0.2.2:5057`

The mobile UI does not call the API yet. API integration should be a separate migration step.
