Install the plugin and wrap the current Next.js config.

For `next.config.ts`:

```ts
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin(
  "./src/i18n/request.ts",
);

const nextConfig: NextConfig = {
  // Preserve all existing configuration here.
};

export default withNextIntl(nextConfig);
```

Do not delete existing Next.js configuration options. Merge them into
`nextConfig`.
