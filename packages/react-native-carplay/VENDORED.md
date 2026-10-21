# Vendored: @g4rb4g3/react-native-carplay 2.7.22

Source: npm `@g4rb4g3/react-native-carplay@2.7.22` (fork of `react-native-carplay` by Birkir
Gudjonsson and contributors), MIT licence — see LICENSE.

Why vendored: upstream declares `react-native` peers up to 0.79; Wayline runs 0.88. Vendoring lets
us widen the peer range without `legacy-peer-deps` for the whole repo, and patch native code if
needed.

Changes from upstream:
- package.json: peer range adds `^0.88.0`; entry points use `src/` (Metro compiles TypeScript)
- `src/`: absolute `src/...` imports rewritten as relative (upstream resolved them at build time; Metro needs relative)
- `src/interfaces/Telemetry.ts`: type import from `react-native` (`react-native/types` is gone in 0.88)
- `types/`: declarations emitted with `npm run build:types` (`tsc --noCheck`); upstream sources predate RN 0.88's
  stricter typings (NativeEventEmitter / NativeModule) — type-only drift, no runtime change. Re-run after edits.
- **New Architecture port** (RN 0.82+ has no bridge; upstream crashes on 0.88 — `reactNativeHost` throws):
  - Android: `ReactInstanceManager` → `ReactHost` (`utils/ReactContextResolver.kt`); the JS
    `AndroidAuto` / `AndroidAutoCluster` apps run on headless `ReactSurface`s instead of
    `catalystInstance.getJSModule(AppRegistry).runApplication`; the map renders into a
    `ReactSurface` view instead of `ReactRootView` (`utils/VirtualRenderer.kt`)
  - Android build: compiles against the app's `react-android` (was pinned to 0.76.9), no own
    buildscript / AGP pin, no `com.facebook.react` plugin (no codegen specs)
  - iOS: root views come from the app's `RCTReactNativeFactory` via `RNCarPlay.setRootViewFactory`
    (`RNCarPlayRootView.swift`) instead of `RCTRootView(bridge:)`; podspec uses
    `install_modules_dependencies` and reads metadata defensively
- removed build leftovers: `ios/build`, Gradle wrapper, `local.properties`, prebuilt `lib/`

Only linked into native builds when `WAYLINE_CAR=1` (see apps/mobile/react-native.config.js).
To update: copy src/, ios/, android/ and the podspec from the new upstream version and re-apply the above.
