# Working instance

How the author runs Job Digger day to day: a separate `git clone` on `main` with its
own database (the author's decision of 20.11.2026, task
[6.08](tasks/6.08-separate-work-instance.md)). The development folder stays for
branches, migrations from unmerged PRs and demo data; real companies live only in the
working database.

None of this is needed to try the project - for that, see
[Running locally](README.md#running-locally) in the README.

|          | Development                    | Working instance                   |
| -------- | ------------------------------ | ---------------------------------- |
| Folder   | `~/code/job-digger`            | `~/code/job-digger-app`            |
| Code     | any branch                     | `main` only                        |
| Server   | `npm run dev`, port 3000       | `npm run app`, port 3100           |
| Database | `job_digger`                   | `job_digger_app`                   |

Both databases live in one container, `job-digger-db`, started from the development
folder. `docker compose` is not run in the working instance folder. The queue workers
of the two servers each work with their own database and do not get in each other's way.

## Setup

Once, to create it:

```bash
cd ~/code
git clone git@github.com:Odinokun/job-digger.git job-digger-app
cd job-digger-app
nvm use
cp ../job-digger/.env .env   # then see below: DATABASE_URL and BACKUP_DIR
docker exec job-digger-db createdb -U job_digger job_digger_app   # -U is POSTGRES_USER from .env
npm run app:update            # dependencies, a database backup, migrations, the build
npm run db:seed               # the system user
npm run app                   # http://127.0.0.1:3100
```

Only two lines change in the clone's `.env`. In `DATABASE_URL`, only the database name
at the end, after the last `/`; the user at the start of the address stays `job_digger`:

```bash
DATABASE_URL=postgres://job_digger:<password>@127.0.0.1:5432/job_digger_app
BACKUP_DIR="/absolute/path/to/an/existing/folder"
```

## Updating

After every merge to `main`: stop the server (Ctrl+C), `npm run app:update`, `npm run app`
(with autostart, `npm run app:restart` - see below). `app:update` refuses to run outside
`main` and runs `git pull --ff-only`, `npm ci`, a database backup (`npm run db:backup`),
`npm run db:migrate` (against the database from this folder's `.env`) and `npm run build`.
This is the only way a new migration reaches the working database - after a merge, not
from a development branch.

## Backups

A backup of the working database is a `job_digger_app-<UTC time>.dump` file
(`pg_dump -Fc` format) in the `BACKUP_DIR` folder (the author's decision of 20.11.2026: a
folder in iCloud Drive, 30 backups kept). It is made automatically: by `npm run app` if
the last backup is older than a day, and by `npm run app:update` always, before
migrations. If the backup fails, the server does not start and the update goes no
further. A manual backup: `npm run db:backup`. The logic is in
[`src/server/db/backup.ts`](src/server/db/backup.ts).

Restoring (checked 20.11.2026: a backup of the development database restored into an
empty database matched the original row for row, migration journal included). First
stop `npm run app`, because `dropdb` does not drop a database with open connections:

```bash
docker exec job-digger-db dropdb -U job_digger --if-exists job_digger_app
docker exec job-digger-db createdb -U job_digger job_digger_app
docker exec -i job-digger-db pg_restore -U job_digger -d job_digger_app --no-owner < "<path to the .dump file>"
npm run app
```

If the whole Docker volume is gone, first run `docker compose up -d` in the development
folder: the container creates the development database but not `job_digger_app`, so the
`createdb` above is needed.

## Autostart

The working instance can start by itself on macOS login. Once, in the clone, after
`npm run app:update`:

```bash
npm run autostart:on    # from this minute the server runs in the background, the terminal can be closed
```

- On the first start macOS shows a window asking for access to iCloud Drive (for the
  backup in `BACKUP_DIR`) - it has to be allowed. Until it is answered, the backup waits,
  and the server does not start.
- Docker Desktop has to start on login too - that is its own setting; the server waits
  for the database as long as it takes.
- After every `npm run app:update` - `npm run app:restart`. With autostart on,
  `npm run app` in a terminal fails with `EADDRINUSE`: port 3100 is already taken.
- The log is `~/Library/Logs/job-digger/app.log`.
- If it crashes, it restarts by itself, at most once a minute. To turn autostart off and
  stop the server: `npm run autostart:off`.
- If the Node version changed (nvm), run `npm run autostart:on` again: the path to
  `node` is written into the autostart.

How it works: [`src/server/autostart/README.md`](src/server/autostart/README.md).

Cookies are not separated by port ([RFC 6265, section 8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)),
so the language and theme are shared between ports 3000 and 3100.

## Scripts

| Command                 | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `npm run app`           | The working instance: the production build on `127.0.0.1:3100`  |
| `npm run app:update`    | Update the working instance after a merge (`main` only)         |
| `npm run app:restart`   | Restart the server started by autostart                         |
| `npm run autostart:on`  | Start the working instance on macOS login                       |
| `npm run autostart:off` | Turn autostart off and stop the server                          |
| `npm run db:backup`     | Back up the database to `BACKUP_DIR`                            |
