import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {};

// The plugin connects the app with `src/i18n/request.ts` - the default path, so no
// argument is needed.
// https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
