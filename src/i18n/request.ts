import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isSupportedLocale, localeCookieName } from "./config";

/**
 * next-intl calls this function once per request to learn the UI language and
 * load the translations. The locale is not in the URL: the language is the user's
 * personal setting, hence the "without i18n routing" mode.
 * https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(localeCookieName)?.value;

  // The cookie value comes from the client, so we trust only known languages:
  // anything else would try to import a translation file that does not exist.
  const locale = isSupportedLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // A shared "now" for relative time ("Last checked: 5 min ago").
    // `NextIntlClientProvider` in the layout inherits it, so the client starts from
    // the same moment as the server, and the text does not diverge on hydration.
    // https://next-intl.dev/docs/usage/configuration#now
    now: new Date(),
  };
});
