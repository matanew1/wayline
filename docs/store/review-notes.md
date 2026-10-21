# Notes for App Review / Play review

Paste into "Notes" (App Store Connect → App Review Information; Play → App access).

---

Wayline is a turn-by-turn navigation app with live traffic and driver-reported hazards.

**Sign-in is optional.** Everything works without an account (guest mode). To test phone sign-in:
Settings → Account → enter **[REVIEW_PHONE]** → code **[REVIEW_CODE]**. No SMS is sent to this number.

**Account deletion:** Settings → Account → Delete account (shown after signing in).

**Background location** is requested only after tapping Go on a route, with an explanation first.
It is used for spoken turn-by-turn guidance while the screen is locked and stops when the drive ends.

**Testing without driving:** search a destination, pick a route and tap Go; guidance follows the
device's real location. On the iOS Simulator use Features → Location → Freeway Drive.

---

## Server setup for the review account

```bash
# production API env (6-digit code; pick a number you own or a reserved test range)
REVIEW_PHONE=+972500000001
REVIEW_CODE=[6 DIGITS]
```

The number never receives SMS and signs in with that code only. Remove the variables after review
if you prefer; nothing else depends on them.
