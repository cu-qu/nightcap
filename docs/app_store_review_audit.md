# NightCap — App Store pre-submission audit

**App:** NightCap (`NightCap` on device) — couple habit / end-of-day ritual tracker  
**Client:** Expo SDK 58 + React Native 0.88 + Expo Router (`mobile/`)  
**Backend:** Django API on Railway (`EXPO_PUBLIC_API_URL` in `mobile/eas.json`)  
**iOS bundle ID:** `com.dailynightcap.app` (`mobile/app.json`)  
**Audit date:** 2026-10-28  
**Guidelines:** [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (Oct 16, 2026)

Legend: **PASS** · **FAIL** · **N/A** · **NEEDS-HUMAN** · **FIXED** (this PR)

---

## Summary

| Result | Count (approx.) |
|--------|-----------------|
| PASS | 38 |
| FAIL | 2 |
| N/A | 12 |
| NEEDS-HUMAN | 14 |
| FIXED in PR | 3 |

**Blockers to resolve before submission:** run production EAS iOS build on **Xcode 26 / iOS 26 SDK** and confirm IAP products in App Store Connect match code; provision **demo accounts** on production API and paste credentials into App Review notes.

---

## 0. Build & upload prerequisites

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Xcode 26 / iOS 26 SDK | NEEDS-HUMAN | No `.github` CI in repo. **FIXED:** `mobile/eas.json` production `ios.image: "latest"` so EAS uses the current Xcode stack (verify build log shows Xcode 26+). Local builds need Xcode 26 installed. |
| `ITSAppUsesNonExemptEncryption` | PASS | `mobile/app.json` → `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` |
| Build number + 1024 icon, no alpha | PASS / NEEDS-HUMAN | Icon: `mobile/assets/images/icon.png` (1024×1024 RGB, no alpha). `ios.buildNumber: "1"`; EAS `autoIncrement: true` bumps on each production build — confirm next upload number in ASC. |
| Paid Apps agreement / banking | NEEDS-HUMAN | App Store Connect → Agreements, Tax, and Banking |

---

## 1. Completeness, crashes, placeholders (2.1(a))

| Item | Status | Evidence / notes |
|------|--------|------------------|
| No placeholder UI copy | PASS | Grep: no lorem/TODO/coming soon in `mobile/app` or `mobile/src`. Auth placeholders `you@example.com` are field hints only. |
| No dev endpoints in Release | PASS | Production API: `mobile/eas.json` → `EXPO_PUBLIC_API_URL` → Railway HTTPS. `mobile/src/api/client.ts` defaults to localhost only when env unset (dev). |
| Crash risks (force unwrap, etc.) | PASS (code scan) | No `fatalError` / `try!` in TS app code. **NEEDS-HUMAN:** Release smoke test on physical device. |
| iPad support | PASS | `supportsTablet: false` → iPhone-only (`mobile/app.json`) |
| Legal/support URLs return 200 | PASS | `curl -I` 200 for `{API}/privacy/`, `/terms/`, `/support/` (Railway production host in `eas.json`) |

---

## 2. Review notes & demo access (2.1(a), 2.1(b), 2.3.1(a))

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Demo account (no OTP trap) | NEEDS-HUMAN | Email verification gate: `mobile/src/utils/needsEmailVerification.ts`, redirect in `mobile/app/_layout.tsx`. Backend helper: `backend/accounts/management/commands/create_review_demos.py` (`demo1`/`demo2`/`demo3`, verified email, complimentary access). **Run on production** with `--password` and document creds in ASC notes (not in repo). |
| Draft review notes | PASS | See **App Review notes (draft)** below |
| Screen recording recommendation | NEEDS-HUMAN | Optional 30–90s device recording for new developer account (soft check) |

---

## 3. Hidden / debug features (2.5.19)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| No runtime mock/debug unlock paths | PASS | Grep: no `bypass`, `isPro = true`, staging unlocks in app source. Mocks only in `mobile/tests/`. |
| Release binary strings scan | NEEDS-HUMAN | After `eas build --platform ios`, run `strings` on `.app` as checklist describes |
| Secret gestures / remote flags | PASS | No version-tap cheats or hidden routes found |
| Token logging / debug menus | PASS | No `console.log` in `mobile/src` or `mobile/app` |

---

## 4. Metadata & screenshots (2.3.x)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Screenshots in use | NEEDS-HUMAN | ASC assets — reference `mobile/app-store/paywall-review.jpg` as internal reference only |
| IAP called out in description | NEEDS-HUMAN | ASC copy must mention subscription + 30-day included period (`mobile/app/paywall.tsx` copy) |
| No Android/Play branding on iOS | PASS | Paywall tests assert no Google copy on iOS (`mobile/tests/paywall.test.tsx`). Platform-specific strings gated with `Platform.OS` |
| Name length / age / category | NEEDS-HUMAN | App name `NightCap` (7 chars). Age rating & category in ASC |
| What's New | NEEDS-HUMAN | First release |

---

## 5. Privacy, permissions, purpose strings (5.1.1)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Privacy policy in app + ASC | PASS | Settings → Privacy (`mobile/app/(tabs)/settings.tsx`), paywall links (`mobile/app/paywall.tsx`), auth `LegalLinks` (`mobile/src/components/LegalLinks.tsx`) |
| Usage descriptions present & specific | PASS | Camera + Photos: `expo-image-picker` plugin in `mobile/app.json`. Notifications: system prompt via `expo-notifications` (no custom pre-prompt copy required for push). No location/contacts/mic/tracking keys declared. |
| No ghost permissions | PASS | Declared permissions align with image picker + notifications usage |
| Pre-permission neutral wording | FIXED | **Was:** Settings button `"Allow iPhone notifications"`. **Now:** `"Turn on notifications"` (`mobile/app/(tabs)/settings.tsx`). Reminder toggle uses system sheet directly. |
| Don't force login for non-account features | N/A | Core journal requires account |
| Regulated fields / org account | N/A | Not finance exchange / gambling |

---

## 6. Account deletion (5.1.1(v))

| Item | Status | Evidence / notes |
|------|--------|------------------|
| In-app deletion + server wipe | PASS | UI: Settings + Paywall → `confirmDeleteAccount` (`mobile/src/utils/deleteAccountPrompt.ts`). API: `DELETE /api/v1/auth/account/` (`mobile/src/api/auth.ts`, `backend/accounts/views.py`, `backend/accounts/deletion.py`). Tests: `backend/accounts/tests_account_deletion.py` |

---

## 7. Login services (4.8)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Sign in with Apple | N/A | Email/username + password only (`mobile/app/(auth)/`). No Google/Facebook/X OAuth |
| SIWA entitlement | N/A | — |

---

## 8. Payments — IAP (3.1.1, 3.1.3)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Digital goods via StoreKit | PASS | `expo-iap` (`mobile/package.json`, `mobile/src/iap/useCoupleIap.ts`). Server verify: `mobile/src/api/billing.ts`, `backend/accounts/iap.py` |
| External checkout for digital | PASS | No Stripe/PayPal in client for unlocks |
| Restore purchases | PASS | Paywall + Settings path (`mobile/app/paywall.tsx`, `useCoupleIap.restore`) |
| Prices from StoreKit | PASS | `displayPrice` from `fetchProducts` (`useCoupleIap.ts`); no hardcoded prices on paywall UI |
| Product IDs match ASC | NEEDS-HUMAN | `com.nightcap.app.couple.monthly` / `.yearly` (`mobile/src/iap/products.ts`, `backend/accounts/iap.py`) — prefix differs from bundle ID; valid if configured that way in ASC |
| IAP attached to version / sandbox test | NEEDS-HUMAN | App Store Connect + TestFlight purchase test |

---

## 9. Subscription paywall (3.1.2)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Title, period, price, benefits | PASS | `mobile/app/paywall.tsx` — plan names, StoreKit prices, couple value prop |
| Prominent billed amount | PASS | Plan prices are primary typography; no deceptive “FREE” headline |
| Terms, Privacy, auto-renew text | PASS | Renewal paragraph + Terms/Privacy/Support links on paywall; Terms also in Settings |
| Terms URL in ASC metadata | NEEDS-HUMAN | Paste `{API}/terms/` into App Description or custom EULA field |
| Dismissable if free tier exists | PASS | Active trial / subscription: **Continue** exits paywall (`paywall.tsx`, tests). After trial expires, paywall is required (subscription app) — Sign out / Delete account still available |
| Auto-renew ≥ 7 days | PASS | Monthly + yearly products |

---

## 10. Tracking / ATT (5.1.2)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| ATT / IDFA | PASS | No ad SDKs; no `NSUserTrackingUsageDescription`; privacy policy states no cross-app tracking (`backend/legal/PRIVACY_POLICY.md`) |
| Don't require tracking for use | PASS | — |

---

## 11. Privacy manifest & SDKs

| Item | Status | Evidence / notes |
|------|--------|------------------|
| `PrivacyInfo.xcprivacy` | NEEDS-HUMAN | Generated at prebuild/EAS from Expo + pods. After first iOS build, confirm merged manifest in archive; bump deps if Apple flags a listed SDK |
| Listed SDK versions | PASS (snapshot) | Expo 58 / RN 0.88 / `expo-iap` 5.6 — verify on build date |
| Privacy nutrition label | NEEDS-HUMAN | Draft from policy: account, journal, photos, purchase history (via Apple), push token — no tracking |

---

## 12. AI & third-party data (5.1.2(i))

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Third-party AI consent | N/A | No LLM APIs in mobile or backend user paths |
| Secret keys in client | PASS | No `sk-` / API keys in app source; JWT via backend |

---

## 13. User-generated content (1.2)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Public UGC / chat | N/A | Private couple journal + partner nudges; not a public social network |

---

## 14. Minimum functionality / spam (4.2, 4.3)

| Item | Status | Evidence / notes |
|------|--------|------------------|
| Not a web wrapper | PASS | Native RN screens, sqlite outbox, notifications, IAP, image picker — not `WKWebView` shell |
| Template spam | PASS | Custom product codebase |
| Clone / saturated category | NEEDS-HUMAN | Positioning: couple ritual tracker — differentiate in ASC screenshots/description |

---

## Changes in this PR

1. **`mobile/eas.json`** — production iOS `image: "latest"` for current Xcode on EAS (required SDK hygiene).
2. **`mobile/app.json`** — `expo-build-properties` `ios.deploymentTarget: "15.1"`.
3. **`mobile/app/(tabs)/settings.tsx`** — neutral notification CTA copy (5.1.1(iv) soft check).

---

## App Review notes (draft — paste into App Store Connect)

**App purpose:** NightCap is a couple-focused end-of-day ritual app: log daily spend and habits, reflect on the day, track goals, and view shared recaps. Works solo or linked with a partner via invite code.

**Demo accounts (production API — credentials set by developer, not stored in git):**

| Account | Password | Role |
|---------|----------|------|
| `demo1` | *(set via `create_review_demos`)* | Solo user, complimentary access |
| `demo2` | same | Couple owner, linked with demo3 |
| `demo3` | same | Partner of demo2 |

Create/refresh on production:

```bash
python manage.py create_review_demos --password '<secure-password>'
```

All three have **email already verified** and **onboarding complete** — no email OTP required for review.

**Recommended demo path (demo2 or demo1):**

1. Sign in on iPhone build (TestFlight or review build — **not Expo Go**; IAP requires dev/client build).
2. Complete or skip partner linking as desired (demo2/demo3 already linked).
3. From **Tonight** tab, tap spend categories → save → follow-up habits / mood / moment photo.
4. Open **Calendar**, **Goals**, **Graphs** to show tracking.
5. **Settings → Membership → See plans** opens the subscription paywall (also shown automatically when the 30-day trial ends).
6. On paywall: prices load from App Store; **Restore purchases** and **Terms / Privacy** links at bottom. Trial users see **Continue** to use the app without subscribing yet.
7. **Settings → Delete account** permanently deletes the account (reviewers may use a throwaway account instead of demo accounts for this step).

**In-app purchases:**

- Subscriptions: `com.nightcap.app.couple.monthly`, `com.nightcap.app.couple.yearly` (one subscription covers both partners when linked).
- Paywall appears when: (a) global redirect after login if membership inactive (`mobile/app/_layout.tsx` + `needsPaywall`), (b) user opens **Settings → See plans**, (c) trial expired.
- New accounts include **30 days** before subscription required (`paywall.tsx` copy; backend trial in `backend/accounts/memberships.py`).
- **Redeem Apple offer code** on paywall for offer-code testing.

**Feature flags / hidden behavior:** None in release builds. No debug menus. Push notifications optional (partner nudges + nightly reminder).

**External services:** Django REST API (Railway URL in production build env), Apple Push Notification service for partner nudges, Apple In-App Purchase (StoreKit 2 via `expo-iap`). No third-party AI. Legal pages served from API origin (`/privacy/`, `/terms/`, `/support/`).

**Encryption:** Standard HTTPS only — `ITSAppUsesNonExemptEncryption` = NO.

**Contact:** Support URL in app Settings; email in hosted support page.

---

## NEEDS-HUMAN checklist for Cuyler

- [ ] Run `create_review_demos` on **production** API; add username/password to ASC review notes
- [ ] Confirm **Paid Apps Agreement** and tax/banking active
- [ ] Create/link IAP products in ASC; attach to app version; sandbox + TestFlight purchase test
- [ ] EAS **production iOS build** with Xcode 26; upload to ASC
- [ ] ASC metadata: description (mention subscription + trial), **Terms URL** in description/EULA, privacy URL, screenshots, age rating, category
- [ ] Privacy nutrition label in ASC (align with `backend/legal/PRIVACY_POLICY.md`)
- [ ] Optional: screen recording for review
- [ ] Decide on custom domain (`api.nightcap.app` in README vs Railway URL in `eas.json`) for long-term branding
- [ ] Physical device smoke test before submit

---

## BLOCKERS / LIKELY REJECTION (if unaddressed)

| Severity | Item | Fix |
|----------|------|-----|
| BLOCKER | IAP not testable without ASC products + dev/client build | Configure ASC + TestFlight |
| BLOCKER | Reviewer hits email verification on non-demo account | Use demo accounts or disable verification for review accounts only (already handled for demos) |
| LIKELY | Missing Terms link in **ASC metadata** (not just in app) | Add URL to description or EULA field |
| LIKELY | Build uploaded with SDK below Apple minimum | Use EAS `latest` image; verify build log |
