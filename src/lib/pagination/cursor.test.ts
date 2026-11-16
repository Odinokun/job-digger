import { describe, expect, it } from "vitest";

import { MAX_CURSOR_KEY_LENGTH, parseCursor } from "./cursor";

const id = "0b7f2a3c-5d4e-4f6a-8b9c-1d2e3f4a5b6c";

describe("parseCursor", () => {
  it("accepts a key and an id", () => {
    expect(parseCursor({ key: "Bosch", id })).toEqual({ key: "Bosch", id });
  });

  it("keeps a key that is only whitespace", () => {
    // Назва компанії з пробілами в базі бути не може, але курсор не вирішує,
    // що є назвою: він лише переносить значення останнього рядка назад у запит.
    expect(parseCursor({ key: " ", id })).toEqual({ key: " ", id });
  });

  it("drops anything that is not an object", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor("Bosch")).toBeNull();
    expect(parseCursor(42)).toBeNull();
  });

  it("drops a missing or empty key", () => {
    expect(parseCursor({ id })).toBeNull();
    expect(parseCursor({ key: "", id })).toBeNull();
    expect(parseCursor({ key: 42, id })).toBeNull();
  });

  it("drops an id that is not a uuid", () => {
    expect(parseCursor({ key: "Bosch", id: "42" })).toBeNull();
    expect(parseCursor({ key: "Bosch" })).toBeNull();
    expect(parseCursor({ key: "Bosch", id: `${id} or 1=1` })).toBeNull();
  });

  it("drops a key longer than the limit", () => {
    const long = "a".repeat(MAX_CURSOR_KEY_LENGTH + 1);

    expect(parseCursor({ key: long, id })).toBeNull();
    expect(parseCursor({ key: long.slice(1), id })).not.toBeNull();
  });

  it("keeps only the two fields of a cursor", () => {
    expect(parseCursor({ key: "Bosch", id, limit: 10_000 })).toEqual({
      key: "Bosch",
      id,
    });
  });
});
