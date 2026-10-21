# Background location

Wayline requests "Always" / background location **only when the driver starts navigation**, after
an in-app explanation (`LocationDisclosure` in `apps/mobile/src/components/Overlays.tsx`). If the
driver declines, guidance works while the app is open.

## In-app disclosure (Google Play "prominent disclosure")

Shown before the system prompt, once, until accepted:

> **Keep guiding when the screen is off**
> Wayline collects location data to give turn-by-turn directions and measure live traffic even
> when the app is closed or not in use, but only while you are navigating. Location points used
> for traffic are anonymous and never include the start or end of your trip.
> [Continue] [Not now]

Hebrew: see `bgTitle` / `bgBody` in `apps/mobile/src/i18n/strings.ts`.

## Play Console — Location permissions declaration

**Feature that uses background location:** Turn-by-turn navigation.

**Why it needs background location:** Drivers lock the screen or switch to music or calls while
driving. Wayline must keep tracking position to announce upcoming turns, detect wrong turns and
reroute, and warn about hazards ahead. A foreground service with a persistent "Wayline is guiding
you" notification runs only for the duration of a drive and stops on arrival or when the driver
ends navigation.

**Video (required, ≤ 30 s):** start a route → tap Go → disclosure dialog → system prompt (Allow all
the time) → lock the phone → hear the next turn announced / show the navigation notification.
Upload it unlisted (e.g. YouTube) and paste the link: `[VIDEO URL]`.

## iOS

`UIBackgroundModes = location, audio`; prompts set in `app.config.ts` and localised in
`apps/mobile/locales/{en,he}.json`. The blue status-bar indicator is shown during background
navigation (`showsBackgroundLocationIndicator: true`).
