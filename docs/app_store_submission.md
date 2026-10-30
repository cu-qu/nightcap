# NightCap — App Store submission pack

Paste the blocks below into App Store Connect. The production API already serves the legal pages and the report/block routes. Fill the review password in App Store Connect only. Do not put it in git.

Checked 29 Oct 2026 against the app on `main` and Apple’s age-rating and privacy definitions.

| Field | Value |
| --- | --- |
| Name | NightCap |
| Bundle ID | `com.dailynightcap.app` |
| SKU | `nightcap-ios` |
| Primary language | English (U.S.) |
| Primary category | Lifestyle |
| Secondary category | None |
| Price | Free, with auto-renewable subscriptions |
| iPhone only | Yes (`supportsTablet` is false). Skip iPad screenshots. |
| Copyright | `2026 NightCap` — use the legal name on the Apple Developer account if it differs |
| Support URL | https://nightcap-api-production-ce8f.up.railway.app/support/ |
| Marketing URL | Leave blank |
| Privacy Policy URL | https://nightcap-api-production-ce8f.up.railway.app/privacy/ |
| Terms of Use (EULA) | Use the standard Apple EULA, and keep the Terms of Use link in the description below. Custom EULA field can point at https://nightcap-api-production-ce8f.up.railway.app/terms/ |

## Order before you tap Submit

1. Agreements, Tax, and Banking: Paid Apps agreement is Active.
2. Create the app record if it does not exist (`com.dailynightcap.app`).
3. Create the subscription group and both products. Attach both to this version.
4. Paste the metadata, privacy answers, and age-rating answers below.
5. Paste the review notes and the demo password.
6. Capture the screenshots on the review build. Do not upload `mobile/app-store/paywall-review.jpg`. That image is an older paywall.
7. The EAS project is already linked: https://expo.dev/accounts/deanquint/projects/nightcap. From `mobile/`, run `npx eas-cli build --platform ios --profile production` in a terminal so Apple credentials can be created, then `npx eas-cli submit --platform ios --profile production --latest`. A non-interactive build stops until those credentials exist. The iOS deployment target in `app.json` is 16.4, which is the minimum this Expo SDK accepts.
8. On the version, select that build, add the screenshots, and submit.

Export compliance on upload: **No**. The app uses standard HTTPS only. `ITSAppUsesNonExemptEncryption` is already false. Content rights: the app does not contain third-party content. Advertising identifier: no.

## Listing copy

**Subtitle** (24 characters)

```
A nightly ritual for two
```

**Promotional text** (125 of 170)

```
End the day together. Log the night, keep a goal in view, and look back with a monthly recap. A new account includes 30 days.
```

**Keywords** (81 of 100)

```
couple,journal,habit,goals,ritual,recap,partner,spend,nightly,together,mood,photo
```

**Description**

```
NightCap is a private end-of-day journal for one person or a couple.

Each night, log what you spent, the habits you kept, a short note, and an optional photo of a favorite moment. A goal can stay personal, or you can share it. A shared goal counts only after both of you approve it. Once a month, a recap looks back at the nights you logged.

A new account includes 30 days. NightCap for two is an auto-renewing subscription, and one subscription covers both people once you are linked. Choose monthly or yearly. Payment is charged to your Apple ID when you confirm. The subscription renews unless you turn off auto-renew at least 24 hours before the period ends. Manage or cancel in Settings → Apple ID → Subscriptions. Subscribing charges today and ends any days still left. Restore purchases is on the plans screen.

Terms of Use: https://nightcap-api-production-ce8f.up.railway.app/terms/
Privacy Policy: https://nightcap-api-production-ce8f.up.railway.app/privacy/
Support: https://nightcap-api-production-ce8f.up.railway.app/support/

NightCap is a personal journal. It is not medical, financial, or legal advice.
```

**What’s New**

```
NightCap is here. Log the night, keep goals with your person, and look back in a monthly recap.
```

## Subscriptions

Create one subscription group, then two auto-renewable products. Set the US price to the amounts already published in the Terms of Use: **$3.00 per month** and **$15.00 per year**. The paywall shows the StoreKit price, so the App Store price and the terms need to match.

| | Monthly | Yearly |
| --- | --- | --- |
| Product ID | `com.nightcap.app.couple.monthly` | `com.nightcap.app.couple.yearly` |
| Reference name | NightCap for two Monthly | NightCap for two Yearly |
| Duration | 1 month | 1 year |
| Display name | NightCap for two | NightCap for two |
| Family sharing | Off | Off |
| Introductory offer | None. The 30 days is an account grant, not a StoreKit free trial. | None |

**Group name:** NightCap for two

**Group description**

```
One membership covers both people in a NightCap couple space.
```

**Monthly description**

```
Shared goals, recaps, and nightly check-ins. Renews every month until you cancel.
```

**Yearly description**

```
Shared goals, recaps, and nightly check-ins. Renews every year until you cancel.
```

**Subscription review notes**

```
Sign in as demo4. The 30-day account period has already ended, so Monthly and Yearly open the App Store payment sheet. demo1, demo2, and demo3 have complimentary access, so their plan buttons stay off. Restore purchases is on the same screen. One subscription unlocks both people after they link.
```

**Subscription review screenshot:** capture the current paywall on demo4, with Yearly and Monthly prices visible, Restore purchases, and the Terms of Use link. The file `mobile/app-store/paywall-review.jpg` still says “month free,” “Terms,” and mentions Google. Leave it out.

## Review notes

Paste this into App Review Information. Replace the password line in App Store Connect. Sign-in required: yes.

```
NightCap is a private end-of-day journal for one person or a couple. Sign in with a username and password. Do not tap Create account. A new account stays on Confirm your email until a message from nightcap@cuqulabs.com is opened.

All four accounts use the same password.
demo1 — solo, verified, onboarded, complimentary access. Plan buttons stay off.
demo2 and demo3 — already linked as partners, complimentary access. Plan buttons stay off.
demo4 — solo, verified, onboarded, 30-day period already ended. Monthly and Yearly open the payment sheet.
Password: PASTE HERE

Path on demo1 or demo2:
1. Sign in.
2. Tonight: log a spend, then the rest of the night, including an optional favorite photo.
3. Calendar, Goals, and Graphs show what was logged.
4. Settings → See plans shows the subscription screen. Restore purchases, Redeem Apple offer code, Terms of Use, Privacy, and Support are on that screen.
5. Settings → Delete account removes the account. Deletion does not cancel an Apple subscription. Please use a separate account for that step, not these demos.

On demo4, Settings → See plans, then tap Monthly or Yearly. Products: com.nightcap.app.couple.monthly and com.nightcap.app.couple.yearly. One subscription covers both people once they are linked.

On demo2, a partner moment can be reported from Settings → Report partner, from the nightly check-in, or from a shared recap. Settings → Block partner unlinks and stops that person from joining again. Reports go to night_cap_app@proton.me.

Notifications and the camera are optional. The Settings button that leads to the iPhone notification prompt is labeled Continue.

No third-party ads, no tracking, no Sign in with Apple, no phone number, no AI features. Encryption is standard HTTPS only.

Privacy https://nightcap-api-production-ce8f.up.railway.app/privacy/
Terms of Use https://nightcap-api-production-ce8f.up.railway.app/terms/
Support https://nightcap-api-production-ce8f.up.railway.app/support/
```

A short screen recording from a cold launch through sign-in, one night logged, and the demo4 payment sheet helps a first submission. Attach it on the same App Review Information page.

## Screenshots

Capture these on a real iPhone or the iOS Simulator, signed into demo2 (and one paywall frame from demo4). Portrait, status bar visible, no device frame required.

Required size for a new iPhone app: **6.9-inch, 1320 × 2868**. In App Store Connect, use that set for the other iPhone sizes when the checkbox is offered.

1. Tonight, with today’s check-in on screen.
2. A spend entry in progress.
3. Goals, including a together goal.
4. Calendar.
5. A recap.
6. Plans, from demo4, with both prices, Restore purchases, and Terms of Use.

## Privacy nutrition label

Tracking: **No**. Data is linked to the user. Purpose for every row: **App Functionality**. Not used for tracking, advertising, or analytics.

| Data type | Collected | Why |
| --- | --- | --- |
| Email Address | Yes | Account email |
| User ID | Yes | Username |
| Photos or Videos | Yes | Optional favorite-moment photo |
| Other User Content | Yes | Notes, moments, goals, categories |
| Other Financial Info | Yes | Spend amounts the person types |
| Fitness | Yes | Workout numbers the person types. No HealthKit |
| Purchase History | Yes | Subscription transaction id, product, expiry, auto-renew |
| Device ID | Yes | Apple push token, only if they allow notifications |
| Other Diagnostic Data | Yes | Server logs (IP, time, error traces) needed to run the API |

Leave these off: Name, Phone Number, Physical Address, Payment Info, Precise Location, Coarse Location, Contacts, Health, Audio, Sensitive Info, Browsing History, Search History, Product Interaction, Advertising Data, Crash Data.

## Age rating

Answer the questionnaire like this. Apple then calculates the rating. Infrequent alcohol references land on **13+** for iOS 26 and **12+** on older systems. Do not override it higher unless you want a stricter rating.

| Question | Answer |
| --- | --- |
| Parental Controls | No |
| Age Assurance | No |
| Unrestricted Web Access | No. Legal links open in the system browser. |
| User-Generated Content | No. A partner can see one person’s moments. That is not a public feed. |
| Social Media | No |
| Messaging and Chat | No. There is no chat composer. A nudge is a reminder to log the day. |
| Advertising | No |
| Profanity or Crude Humor | None |
| Horror/Fear Themes | None |
| Alcohol, Tobacco, or Drug Use or References | Infrequent. Optional spend goals include a drinks budget and a “going out” example about bars. |
| Medical or Treatment Information | None |
| Health or Wellness Topics | None. The app stores what someone types. It does not give medical or diet advice. |
| Mature or Suggestive Themes | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Guns or Other Weapons | None |
| Gambling | None |
| Simulated Gambling | None |
| Contests | None |
| Loot Boxes | None |

Made for Kids: No. The privacy policy says NightCap is not directed at children under 13.

## Demo accounts

Created on the production API on 29 Oct 2026. Usernames: `demo1`, `demo2`, `demo3`, `demo4`. Emails are `demo1@nightcap.app` through `demo4@nightcap.app`. Sign-in uses the username. The shared password is not stored in this file.

Refresh them on the production API after this code is deployed:

```bash
python manage.py create_review_demos --password '<the review password>'
```

That command is already on the production service. Run it again only when you want to reset the four accounts.
