# Store submission kit

Everything to paste into App Store Connect and the Google Play Console. Replace `[BRACKETED]`
values first — the same placeholders appear in the API's `/privacy` page, which shows a draft
banner until they're filled in (`apps/api/src/modules/legal/legal.content.ts`).

| File | Used for |
|---|---|
| [listing.md](listing.md) | Name, subtitle, descriptions, keywords (English + Hebrew) |
| [privacy-answers.md](privacy-answers.md) | Play **Data safety** form and App Store **App Privacy** labels |
| [background-location.md](background-location.md) | Play **location permissions declaration**, iOS justification, the in-app disclosure |
| [review-notes.md](review-notes.md) | App Review / Play review notes, test sign-in |

## URLs the stores ask for

| Field | Value |
|---|---|
| Privacy policy | `https://[API_HOST]/privacy` (Hebrew: `?lang=he`) |
| Account deletion (Play) | `https://[API_HOST]/delete-account` |
| Support | `[SUPPORT URL OR EMAIL]` |

## Checklist

- [ ] Fill in placeholders in `legal.content.ts` and these files; confirm `/privacy` has no draft banner
- [ ] Set `REVIEW_PHONE` / `REVIEW_CODE` on the production API (see review-notes.md)
- [ ] Record the background-location video for Play (see background-location.md)
- [ ] Screenshots: 6.7" and 5.5" iPhone, Android phone — home, route preview, navigation, report sheet, Hebrew UI
- [ ] Content rating questionnaires (no user-generated text; reports are fixed categories)
- [ ] Configure log retention to 30 days and Kafka `probes.raw` retention to 7 days (the policy promises both; compose/k8s already set 7 days for Kafka)
