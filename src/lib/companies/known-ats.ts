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
 * Шаблон → назва платформи:
 *
 * - з крапкою на початку - будь-який піддомен (`.bamboohr.com` -
 *   `acme.bamboohr.com`, компанія в піддомені);
 * - без крапки - рівно цей хост (`apply.workable.com/acme`, компанія в шляху);
 * - зі шляхом - цей хост і адреса, що починається з цього шляху
 *   (`join.com/companies/`): платформа тримає дошки на тому самому хості, що й
 *   свій сайт.
 *
 * Сам домен і `www.` не підпадають під піддомен: це сайт постачальника, на
 * нього веде «Powered by ...», а не дошка компанії.
 *
 * Хости перевірені справжніми запитами 19.11.2026: хост відповідає й належить
 * цьому постачальнику, а для платформ задачі 5.15 (Україна й Німеччина) - ще й
 * веде на справжню кар'єрну сторінку (BITE, Umantis - власні сторінки
 * постачальників; d.vinci - клієнт `impulse`).
 */
const KNOWN_ATS: Array<[pattern: string, name: string]> = [
  [".bamboohr.com", "BambooHR"],
  ["apply.workable.com", "Workable"],
  ["jobs.smartrecruiters.com", "SmartRecruiters"],
  ["careers.smartrecruiters.com", "SmartRecruiters"],
  [".recruitee.com", "Recruitee"],
  [".teamtailor.com", "Teamtailor"],
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
  // Німеччина (задача 5.15). rexx тут немає: його клієнти тримають кар'єрну
  // сторінку на власному домені (задача 5.13).
  ["jobs.b-ite.com", "BITE"],
  [".onlyfy.jobs", "onlyfy"],
  ["jobs.umantis.com", "Umantis"],
  [".dvinci-hr.com", "d.vinci"],
  ["join.com/companies/", "JOIN"],
];

/**
 * Назва відомої ATS без парсера, на яку веде адреса, або `null`. Приймає і
 * абсолютну адресу, і очищену (`acme.bamboohr.com`), як її зберігає база.
 */
export function knownAtsName(url: string): string | null {
  const parsed = parse(url);

  if (parsed === null) {
    return null;
  }

  const { host, path } = parsed;
  for (const [pattern, name] of KNOWN_ATS) {
    const slash = pattern.indexOf("/");
    if (slash !== -1) {
      if (
        host === pattern.slice(0, slash) &&
        path.startsWith(pattern.slice(slash))
      ) {
        return name;
      }
    } else if (pattern.startsWith(".")) {
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

function parse(url: string): { host: string; path: string } | null {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url)
      ? url
      : `https://${url}`;
    const parsed = new URL(absolute);
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname };
  } catch {
    return null;
  }
}
