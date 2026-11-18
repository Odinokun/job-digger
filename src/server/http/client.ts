/**
 * Модуль HTTP-запитів: єдиний шлях, яким сервер ходить на чужі сайти
 * (docs/discovery-and-parsing.md, розділ 6, «Ввічливість до сайтів»).
 *
 * Транспорт - `node:http` / `node:https`, а не глобальний `fetch`: тільки сюди
 * можна передати власну функцію `lookup` і перевіряти адреси з DNS у момент
 * зʼєднання (`safeLookup` у ssrf.ts).
 */
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";

/** Чесне представлення: хто ходить на сайт і навіщо. */
export const USER_AGENT = "JobDigger/0.1 (personal job tracker)";

export interface HttpResponse {
  status: number;
  /** Логічна адреса відповіді - та, яку бачив би браузер, без підміни. */
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface HttpClientOptions {
  /**
   * Адреса фейкового вебсервера для тестів. Запит на `https://host/path` тоді
   * йде на `{fakeOrigin}/host/path` (src/server/http/testing/README.md).
   */
  fakeOrigin?: string;
}

export interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  return {
    async get(url) {
      const logical = new URL(url);
      const target = new URL(
        `/${logical.host}${logical.pathname}${logical.search}`,
        options.fakeOrigin,
      );

      return new Promise((done, fail) => {
        httpRequest(
          target,
          { headers: { "user-agent": USER_AGENT } },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () =>
              done({
                status: res.statusCode ?? 0,
                url: logical.toString(),
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
            res.on("error", fail);
          },
        )
          .on("error", fail)
          .end();
      });
    },
  };
}
