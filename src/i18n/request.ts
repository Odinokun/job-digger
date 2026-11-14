import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isSupportedLocale, localeCookieName } from "./config";

/**
 * next-intl викликає цю функцію раз на запит, щоб дізнатися мову інтерфейсу
 * й підвантажити переклади. Локаль не в URL: мова - особисте налаштування
 * користувача, тому режим "without i18n routing".
 * https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(localeCookieName)?.value;

  // Значення cookie приходить від клієнта, тому довіряємо лише відомим мовам:
  // будь-що інше дало б спробу імпортувати неіснуючий файл перекладів.
  const locale = isSupportedLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
