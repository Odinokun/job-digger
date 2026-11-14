import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {};

// Плагін звʼязує застосунок із `src/i18n/request.ts` - шляхом за
// замовчуванням, тому аргумент не потрібен.
// https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
