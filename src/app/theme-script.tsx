import { DEFAULT_THEME, THEME_COOKIE_NAME } from "@/lib/theme";

/**
 * Код, який виставляє тему до першого фарбування сторінки.
 *
 * **Атрибутом `data-theme` володіє саме він, а не React.** Якби його рендерив
 * layout із cookie, вийшов би конфлікт двох власників: Server Action, що пише
 * cookie, змушує Next перерендерити кореневий layout на клієнті, і той рендер
 * повертав би атрибут до серверного значення - знімаючи те, що щойно поставив
 * перемикач. На екрані це виглядало як блимання: тема вмикалася на долю
 * секунди й поверталася назад.
 *
 * Тому `<html>` віддається без `data-theme`, а цей скрипт ставить його сам -
 * і при завантаженні, і для всіх трьох режимів.
 *
 * Скрипт рендериться **завжди**, а не за умовою. Інакше він зʼявлявся б у
 * дереві під час клієнтського рендера, а такі теги React не виконує й
 * попереджає про це в консолі («Encountered a script tag while rendering React
 * component»).
 *
 * Ціна рішення: без JavaScript тема завжди світла.
 *
 * Чому взагалі скрипт, а не медіазапит у CSS: у `@heroui/styles@3.2.7` темні
 * токени оголошені селекторами `.dark, [data-theme="dark"], :host(.dark),
 * :host([data-theme="dark"])`, і `prefers-color-scheme` у файлі немає жодного
 * разу. Повторити весь набір змінних бібліотеки під медіазапитом неможливо
 * підтримувати.
 */
const APPLY_THEME = `
(function () {
  try {
    var query = window.matchMedia("(prefers-color-scheme: dark)");

    function stored() {
      var match = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE_NAME}=([^;]*)/);

      return match ? decodeURIComponent(match[1]) : "${DEFAULT_THEME}";
    }

    function apply() {
      var choice = stored();

      document.documentElement.dataset.theme =
        choice === "light" || choice === "dark"
          ? choice
          : query.matches
            ? "dark"
            : "light";
    }

    apply();

    // Системна тема може змінитися, поки сторінка відкрита: вечірній перехід
    // macOS у темну не має чекати на перезавантаження. Cookie перечитується
    // щоразу, тому після явного вибору слухач нічого не робить.
    query.addEventListener("change", apply);
  } catch (error) {
    // Якщо cookie або matchMedia недоступні, лишається світла тема з :root -
    // показати сторінку в ній краще, ніж зламати рендер заради оформлення.
  }
})();
`;

/**
 * Тег зі скриптом теми.
 *
 * Серверний компонент: ні стану, ні обробників - лише розмітка, яку браузер
 * виконає сам.
 */
export function ThemeScript() {
  return (
    <script
      // Вміст - власна константа, зібрана з наших же значень, а не дані
      // користувача: вставляти її так безпечно.
      dangerouslySetInnerHTML={{ __html: APPLY_THEME }}
    />
  );
}
