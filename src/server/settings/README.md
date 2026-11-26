# src/server/settings - user settings

Personal settings that live in the database (the `settings` table, task 6.01). For
now that is only the auto-check interval. The theme and the language live in cookies,
not here; why: [`lib/theme.ts`](../../lib/theme.ts).

| File                            | Contents                                                      |
| ------------------------------- | ------------------------------------------------------------- |
| `settings.ts`                   | `getSettings` and `setAutoCheckInterval`                      |
| `settings.integration.test.ts`  | default values, overwriting, user isolation, the `CHECK` in the database |

- **The row appears with the first choice.** Until it exists, `getSettings` returns
  the default (`DEFAULT_AUTO_CHECK_INTERVAL`, 6 h). So neither the seed nor user
  creation has to know about settings.
- **A write is one `insert ... on conflict do update`**: both the first choice and a
  change go through one query, without "read, then decide".
- **The list of intervals** lives in
  [`lib/settings/auto-check-interval.ts`](../../lib/settings/auto-check-interval.ts):
  both the list on the page and the `CHECK` on the column come from it. A value from
  the client goes through `parseAutoCheckInterval`, and an invalid one is refused,
  not replaced.
