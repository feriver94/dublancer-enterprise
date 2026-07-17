Update the existing `src/app/layout.tsx`; do not replace unrelated
providers or metadata.

Required imports:

```ts
import { getLocale, getMessages } from "next-intl/server";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getLocaleDirection } from "@/i18n/config";
import type { AppLocale } from "@/i18n/config";
import "@/styles/bidi.css";
```

Inside the root layout:

```tsx
const locale = (await getLocale()) as AppLocale;
const messages = await getMessages();
const direction = getLocaleDirection(locale);
```

Render:

```tsx
<html lang={locale} dir={direction}>
  <body>
    <LocaleProvider
      locale={locale}
      messages={messages}
      timeZone="Asia/Dubai"
    >
      {children}
    </LocaleProvider>
  </body>
</html>
```

Preserve all existing providers, scripts, classes and metadata by placing
them inside or around `LocaleProvider` as appropriate.
