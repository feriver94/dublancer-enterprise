Add inside `model User`:

```prisma
preferredLocale String @default("en-AE")
```

Inside `model OrganizationSettings`, replace:

```prisma
locale String @default("en")
```

with:

```prisma
defaultLocale    String   @default("en-AE")
supportedLocales String[] @default(["en-AE", "ar-AE"])
```

Keep:

```prisma
timezone        String @default("UTC")
defaultCurrency String @default("USD")
```

The locale service will update those values to `Asia/Dubai` and `AED`
for UAE organizations.
