/**
 * Відомі ATS без парсера (задача 5.15): платформи, які пошук упізнає за доменом,
 * але читати поки не вміє. Посилання з сайту компанії на таку платформу - не
 * чуже посилання, а кар'єрна сторінка, яку зберігаємо як непідтримуване
 * джерело з назвою платформи. Так видно, які парсери потрібні насправді.
 *
 * Лише домени, без форми адреси дошки: шаблони адрес у документації
 * постачальників здебільшого не описані. Тому знахідка - одна на платформу
 * (`src/server/discovery/ats-links.ts`), а не одна на дошку.
 *
 * Платформа з парсером тут бути не повинна: її впізнає `platform.ts`. Новий
 * парсер прибирає свій рядок звідси (src/server/parsers/README.md, «Як додати
 * платформу»).
 */

/**
 * Хост → назва платформи. Шаблон з крапкою на початку - будь-який піддомен
 * (`.bamboohr.com` - `acme.bamboohr.com`, компанія в піддомені), без крапки -
 * рівно цей хост (`apply.workable.com/acme`, компанія в шляху).
 *
 * Сам домен і `www.` не підпадають під піддомен: це сайт постачальника, на
 * нього веде «Powered by ...», а не дошка компанії.
 *
 * Домени перевірені справжніми запитами 19.11.2026: хост відповідає, і він
 * належить цьому постачальнику.
 */
const KNOWN_ATS: Array<[pattern: string, name: string]> = [
  [".bamboohr.com", "BambooHR"],
  ["apply.workable.com", "Workable"],
  ["jobs.smartrecruiters.com", "SmartRecruiters"],
  ["careers.smartrecruiters.com", "SmartRecruiters"],
  [".recruitee.com", "Recruitee"],
  [".teamtailor.com", "Teamtailor"],
  [".jobs.personio.de", "Personio"],
  [".jobs.personio.com", "Personio"],
  [".breezy.hr", "Breezy HR"],
  [".applytojob.com", "JazzHR"],
  ["jobs.jobvite.com", "Jobvite"],
  [".icims.com", "iCIMS"],
  [".taleo.net", "Oracle Taleo"],
  [".successfactors.com", "SAP SuccessFactors"],
  [".successfactors.eu", "SAP SuccessFactors"],
  [".pinpointhq.com", "Pinpoint"],
  ["ats.rippling.com", "Rippling"],
  [".homerun.co", "Homerun"],
  [".factorialhr.com", "Factorial"],
  [".softgarden.io", "softgarden"],
  ["jobs.gem.com", "Gem"],
  ["jobs.dover.com", "Dover"],
  ["app.dover.com", "Dover"],
  [".ultipro.com", "UKG Pro"],
  [".dayforcehcm.com", "Dayforce"],
  ["recruiting.paylocity.com", "Paylocity"],
];

/**
 * Назва відомої ATS без парсера, на яку веде адреса, або `null`. Приймає і
 * абсолютну адресу, і очищену (`acme.bamboohr.com`), як її зберігає база.
 */
export function knownAtsName(url: string): string | null {
  const host = hostOf(url);

  if (host === null) {
    return null;
  }

  for (const [pattern, name] of KNOWN_ATS) {
    if (pattern.startsWith(".")) {
      const domain = pattern.slice(1);
      if (host.endsWith(pattern) && host !== `www.${domain}`) {
        return name;
      }
    } else if (host === pattern) {
      return name;
    }
  }

  return null;
}

function hostOf(url: string): string | null {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url)
      ? url
      : `https://${url}`;
    return new URL(absolute).hostname.toLowerCase();
  } catch {
    return null;
  }
}
