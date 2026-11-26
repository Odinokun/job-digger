import { DEFAULT_THEME, THEME_COOKIE_NAME } from "@/lib/theme";

/**
 * Code that sets the theme before the page's first paint.
 *
 * **This script owns the `data-theme` attribute, not React.** If the layout
 * rendered it from the cookie, there would be two owners in conflict: a Server
 * Action that writes the cookie makes Next re-render the root layout on the
 * client, and that render would put the attribute back to the server value -
 * removing what the switch has just set. On screen this looked like a flash: the
 * theme turned on for a split second and went back.
 *
 * So `<html>` is sent without `data-theme`, and this script sets it itself - on
 * load and for all three modes.
 *
 * The script is rendered **always**, not conditionally. Otherwise it would
 * appear in the tree during a client render, and React does not execute such
 * tags and warns about it in the console ("Encountered a script tag while
 * rendering React component").
 *
 * The cost: without JavaScript the theme is always light.
 *
 * Why a script at all, and not a media query in CSS: in `@heroui/styles@3.2.7`
 * the dark tokens are declared with the selectors `.dark, [data-theme="dark"],
 * :host(.dark), :host([data-theme="dark"])`, and `prefers-color-scheme` does not
 * appear in the file once. Repeating the library's whole set of variables under a
 * media query would be impossible to maintain.
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

    // The system theme can change while the page is open: macOS switching to
    // dark in the evening should not wait for a reload. The cookie is re-read
    // every time, so after an explicit choice the listener does nothing.
    query.addEventListener("change", apply);
  } catch (error) {
    // If the cookie or matchMedia is unavailable, the light theme from :root
    // stays - showing the page in it is better than breaking the render over looks.
  }
})();
`;

/**
 * The tag with the theme script.
 *
 * A server component: no state, no handlers - only markup the browser runs by
 * itself.
 */
export function ThemeScript() {
  return (
    <script
      // The content is our own constant, built from our own values, not user
      // data: inserting it this way is safe.
      dangerouslySetInnerHTML={{ __html: APPLY_THEME }}
    />
  );
}
