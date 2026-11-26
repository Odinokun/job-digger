# src/server - the server side

All of the app's server code lives here, apart from the pages and components in
[`src/app`](../app) ([`CLAUDE.md`](../../CLAUDE.md#repository-layout)).

Rule: client components never import modules from `src/server` directly. The
client reaches the server only through Server Actions or server components.

Subfolders:

- [`db`](db/README.md) - the schema, the PostgreSQL connection, migrations and seed.
- [`companies`](companies/README.md) - duplicate detection, company lists and adding.
  Working with the address string itself is outside `src/server`, in
  [`lib/companies`](../lib/companies/README.md): the client needs it too.
- [`parsers`](parsers/README.md) - vacancy parsers for the platforms and for an own page with a recipe.
- [`vacancies`](vacancies/README.md) - the vacancy key and its lifecycle.
- [`checks`](checks/README.md) - checks: Check now, Check all, Find new pages, auto-check, History, the Failed Sources Drawer.
- [`queue`](queue/README.md) - the check queue in PostgreSQL: claiming tasks, their
  results, returning stuck ones and finishing runs.
- [`discovery`](discovery/README.md) - finding a company's career pages from its site address.
- [`csv`](csv/README.md) - the company CSV for Export and Import in Settings.
- [`settings`](settings/README.md) - user settings in the database: the auto-check interval.
- [`autostart`](autostart/README.md) - starting the working instance on macOS login.
- [`http`](http/README.md) - outgoing requests: the single HTTP client with politeness
  towards sites, SSRF protection and the fake web server for tests.

New subfolders are created in their own tasks, not ahead of time.
