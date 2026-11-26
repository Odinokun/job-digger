# src/server/http - outgoing requests

Everything the server uses to reach other sites: SSRF protection and the request
module with politeness towards sites. The short rules are in [`CLAUDE.md`](../../../CLAUDE.md#security), the details below.

## Files

| File           | Role                                                            |
| -------------- | --------------------------------------------------------------- |
| `ssrf.ts`      | `checkUrl(url)` - whether an address may be visited, before the request; `safeLookup` - checking DNS addresses at connection time; `isPublicIp(ip)` |
| `ssrf.test.ts` | Unit tests of the protection                                    |
| `http-client.ts` | `httpClient` - the app's **single** client; reads `FAKE_WEB_ORIGIN` and `RETRY_ATTEMPTS` |
| `retry-attempts.ts` | `parseRetryAttempts` - the `RETRY_ATTEMPTS` variable: 0-2 retries, 2 by default (task 6.04) |
| `retry-attempts.test.ts` | The default, the range, an invalid value is an error |
| `client.ts`    | `createHttpClient(options)` with `get(url)` and `post(url, json)` - the request module |
| `client.integration.test.ts` | Client tests against a local server through address substitution |
| `host-limiter.ts` | `createHostLimiter` - scheduling requests to one host |
| `host-limiter.test.ts` | Scheduling tests with a clock the test controls |
| [`testing/`](testing/README.md) | The fake web server tests use instead of real sites |

## Request module

`createHttpClient(options).get(url)` returns the status, the headers, the body and the
**logical** address - the one a browser would see, without substitution. The transport
is `node:http` / `node:https`, not `fetch`: only that way can a `lookup` be passed and
DNS addresses be checked at connection time. The task's decisions and steps:
[tasks/3.02](../../../tasks/3.02-polite-http-client.md).

- **User-Agent** - `USER_AGENT`, an honest introduction of the app.
- **A single client** - the app goes through `httpClient` from `http-client.ts` and does
  not create its own: the schedule of requests to sites belongs to the client, and only a
  shared one holds the limit for the whole app.
- **The real transport** - `node:https` / `node:http` with `lookup: safeLookup`: DNS
  addresses are checked at connection time. A `safeLookup` refusal is `blocked`, with no
  retries. `lookup` can be passed as a parameter: that way tests go through the real path
  without a network (a DNS where `site.test` leads to `127.0.0.1` or `10.0.0.1`).
- **Address substitution** - with `fakeOrigin` (in the app, the `FAKE_WEB_ORIGIN`
  variable, see `.env.example`) a request to `https://host/path?q` goes to
  `{fakeOrigin}/host/path?q`. That is how the app reaches the fake web server in tests,
  and the client tests reach their own local server. `fakeOrigin` is allowed only on this
  machine (`127.0.0.1`, `::1`, `localhost`): substitution lets requests past the DNS
  check, so a variable that slipped into production has to stop the app, not send
  requests to someone else's server.
- **Redirects** (301, 302, 303, 307, 308) are handled by the client, not the transport:
  every new address, including a relative one, goes through `checkUrl` **before** it is
  requested. More than 5 hops in a row is an error.
- **Timeout** - `TIMEOUT_MS` (20 s) for the whole request, from connecting to the last
  byte, not for silence on the socket: a site sending one byte per second would
  otherwise hold the request for as long as it liked.
- **Size limit** - `MAX_BYTES` (5 MB). A declared `Content-Length` above the limit is
  refused before the body; the actual body is cut off as soon as it exceeds the limit,
  not after downloading. Both values can be passed to `createHttpClient` - so tests do
  not wait 20 seconds.
  - **A refusal is always a `too-large` error, never an empty response.** The client
    refuses by itself instead of waiting for an `error` from `request.destroy`: if the
    body had already arrived in full, Node emits `end`, not `error`, and before 3.08 this
    gave a success with an empty body - for a parser "zero vacancies", that is deleting
    all of them.
  - **A per-request limit** - `client.get(url, { maxBytes })`, which applies to redirects
    too. Only for known APIs that return everything in one request without pages: Ashby
    asks for 30 MB (OpenAI - 14 MB, `src/server/parsers/README.md`). Arbitrary sites keep
    5 MB.
- **Retries** - up to two (`RETRY_ATTEMPTS`, 0-2), with 1 s and 2 s pauses
  (`RETRY_PAUSES_MS`), and only where the next attempt can really succeed: a network
  failure, a timeout, a 5xx response. A 4xx response, including 404, is returned at once
  - what to do with it is the parser's decision. An SSRF refusal, a response that is too
  large and redirect loops are not retried. Retries apply to each address of a redirect
  chain separately. The pause function can be passed as `sleep` - so tests do not wait
  real seconds.
- **429 and `Retry-After`** - the client waits as long as the site asks and tries again;
  these waits are separate from ordinary retries. `Retry-After` is parsed in both
  formats of [RFC 9110, 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3):
  a number of seconds and a date (for a date, the current time comes from the `now`
  parameter). A request longer than 60 s (`MAX_RETRY_AFTER_MS`: on Vercel the whole check
  gets 4.5 min), a 429 without the header, or a third 429 in a row is a `rate-limited`
  error, and the source counts as failed in this check.
- **Politeness towards a site** - **every** attempt goes through `createHostLimiter`,
  including retries and redirect steps: at most two simultaneous requests to one host
  (`MAX_PER_HOST`) and at least 2 s between their starts (`GAP_PER_HOST_MS`). Different
  hosts do not wait for each other. A "site" is a host, so every company on one ATS
  shares its limit. The schedule belongs to the client: for the limit to apply to all
  requests, the app has to go through **one** client. Also checked in real time (by hand,
  18.11.2026): three requests to one host started at 0, 2 and 4 s, a request to another
  host at once.
- **Per-request headers** - `client.get(url, { headers })`, which apply to redirects too.
  For APIs that do not answer without a header: Hurma gives 403 without
  `X-Requested-With: XMLHttpRequest` (`src/server/parsers/README.md`). The client sets the
  User-Agent and the body headers itself - such keys in `headers` are dropped in any case,
  so the UA stays honest.
- **POST with JSON** - `client.post(url, json)`, for APIs that return data only this way
  (Workday, `src/server/parsers/README.md`). SSRF protection, limits, scheduling and
  retries are the same as in `get`: this is a read, and a retry changes nothing on the
  site. **A redirect is not followed** but returned as the response: after 301/302/303
  the request would become a GET, after 307/308 a POST again
  ([RFC 9110, 15.4](https://www.rfc-editor.org/rfc/rfc9110#section-15.4)), and for a known
  API both mean that it has changed - the parser has to see that.
- **Checked by hand on the real network** (18.11.2026): `example.com` - 200;
  `boards-api.greenhouse.io/v1/boards/discord/jobs` - 200, the same 21 184 bytes as in the
  saved response; `10.0.0.1.nip.io` - `blocked` in 6 ms. This very check found that a
  `safeLookup` refusal at first became `network` and was retried.
- **Errors** - an `HttpError` with a `reason` field, so the parser can tell causes apart:
  `blocked` (the SSRF protection refused, at any step), `too-many-redirects`, `timeout`,
  `too-large`, `network` (a network failure that did not pass after the retries),
  `rate-limited`. A server error (5xx) after the retries is not an exception but a
  response with its own status. An address `checkUrl` rejected never goes to the network
  at all.

## SSRF protection

`checkUrl` takes a string and returns either `{ ok: true, url }` with an already parsed
`URL`, or `{ ok: false, reason }`. From then on the code works with the returned `URL`,
not the original string: what is checked and what is used must be one and the same.

Refusal reasons:

- `invalid-url` - the string does not parse as an address;
- `scheme` - the scheme is neither http nor https (`ftp:`, `file:` and so on);
- `local-host` - `localhost` or its subdomain in any spelling (`LOCALHOST.`,
  `api.localhost`). Refused by name, before DNS
  ([RFC 6761, section 6.3](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.3)).
  `localhost.example.com` is an ordinary public domain and passes;
- `private-ip` - the address itself holds an IP that is not from the public internet:
  private networks, loopback, link-local (where the cloud metadata address
  `169.254.169.254` lives), carrier-grade shared space, documentation, multicast,
  reserved. The list is checked against IANA's special address registries
  ([IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/),
  [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/)) and is
  deliberately wider than them: IPv6 addresses with an embedded IPv4 (NAT64, 6to4,
  Teredo) are refused too, because `64:ff9b::a00:1` is the internal 10.0.0.1. The list
  with an explanation of each network is `BLOCKED_NETWORKS` in `ssrf.ts`.

Tricky IP spellings (`2130706433`, `0x7f.1`, `127.1`) are not parsed separately: `URL`
itself reduces them to a plain `127.0.0.1`, and that is what gets checked. An IPv4 wrapped
in IPv6 (`::ffff:127.0.0.1`) is checked by `net.BlockList` with the IPv4 rules.
`isPublicIp(ip)` is the same table for addresses obtained from DNS.

### Addresses from DNS

`checkUrl` cannot see where an ordinary domain leads: `10.0.0.1.nip.io` is a public name
that resolves to 10.0.0.1. `safeLookup` catches this - a function in the
[`lookup`](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener) format
that the HTTP module (3.02) passes to `http.request`:

- the check happens **at connection time** and on the very addresses the connection will
  use. A separate DNS check before the request would leave a window in which the domain
  could start pointing to an internal address (DNS rebinding);
- it refuses if **any** of the addresses is internal: otherwise the connection could land
  exactly on it. The error has `code: "ERR_SSRF_PRIVATE_ADDRESS"`;
- a DNS error itself (`ENOTFOUND` and the like) is passed on unchanged;
- it supports both `lookup` modes: with `all: true` it returns an array of addresses (Node
  asks for this with `autoSelectFamily` on), without it a single address.

`createSafeLookup(resolve)` is the same function with the resolver as a parameter: that is
how it is tested without a network. Also checked on real DNS (by hand, 18.11.2026):
`example.com` opens, `10.0.0.1.nip.io` is refused with `ERR_SSRF_PRIVATE_ADDRESS`.

The HTTP module 3.02 builds redirects and the substitution to the fake web server from
these two functions: every redirect step goes through `checkUrl`, every connection
through `safeLookup`.
