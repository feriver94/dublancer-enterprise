# Localization and RTL

- Supported locales: `en-AE` and `ar-AE`.
- Locale resolution: `dublancer_locale` cookie, trusted locale header fallback, then `en-AE`.
- Root HTML emits matching `lang` and `dir`; the client translation provider uses the same messages/time zone.
- `messages/en-AE.json` and `messages/ar-AE.json` have identical key sets, checked by `npm run verify:locales`.
- The product console is responsive and reverses text flow under RTL while machine-readable JSON remains LTR.
- Currency and date defaults are AED, `Asia/Dubai`, and UAE jurisdiction. Stored monetary amounts use integer minor units.

Arabic product wording is provided for the coordinated modules. Legal terms, payment disclosures, tax documents, and regulated notices must receive jurisdiction-specific human legal review before production publication.
