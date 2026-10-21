# Privacy answers

Derived from what the code actually does — keep this file in sync when data flows change.

## Google Play — Data safety

**Does your app collect or share user data?** Yes. **Encrypted in transit?** Yes (HTTPS/WSS).
**Can users request deletion?** Yes — in app (Settings → Account → Delete account) and at `/delete-account`.

| Data type | Collected | Shared | Optional | Purposes | Notes |
|---|---|---|---|---|---|
| Location → Precise location | Yes | No | No (core feature) | App functionality, Analytics (traffic) | Used while navigating, incl. background. Traffic points are anonymous (random trip code, start/end 300 m trimmed on device). |
| Personal info → Phone number | Yes | No¹ | Yes (guest mode) | Account management | Stored only as a salted hash. |
| App activity → Other user-generated content | Yes | No | Yes | App functionality | Hazard reports (fixed categories, no free text); shown to others without identity. |
| Personal info → Other info (saved places) | Yes | No | Yes | App functionality | Home / Work / favourites. |
| App info and performance → Crash logs / Diagnostics | Yes | No | No | App functionality | Server request logs (IP) kept ≤ 30 days. |

¹ Sent to the SMS provider to deliver the sign-in code. Play treats transfers to service providers acting on your behalf as **not shared**.

Not collected: name, email, contacts, photos, audio, messages, financial info, health, web history, device IDs for advertising.

## Apple — App Privacy ("nutrition label")

**Data Used to Track You:** none.

**Data Linked to You:**
- Contact Info → Phone Number — App Functionality (sign-in)
- Location → Precise Location — App Functionality (trip start/end and routes are stored with the account)
- User Content → Other User Content — App Functionality (saved places, reports)

**Data Not Linked to You:**
- Location → Precise Location — Analytics (anonymous traffic measurement)
- Diagnostics → Other Diagnostic Data — App Functionality (server logs)
