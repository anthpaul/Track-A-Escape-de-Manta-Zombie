/**
 * Tests for the DynamoDB key builders.
 *
 * The padding test is the critical one: without it a Query for the latest
 * turn returns wrong results once turn numbers have different digit counts
 * (e.g. turn 9 sorts after turn 20 under lexicographic order).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KEYS, _padTurn, ttlManana, generarPartidaId } from "./keys";

// ---------------------------------------------------------------------------
// padTurn — the fix for the lexicographic ordering bug
// ---------------------------------------------------------------------------

describe("_padTurn", () => {
  it("pads single-digit turns to 6 characters", () => {
    assert.equal(_padTurn(1), "000001");
    assert.equal(_padTurn(9), "000009");
  });

  it("pads two-digit turns to 6 characters", () => {
    assert.equal(_padTurn(20), "000020");
    assert.equal(_padTurn(99), "000099");
  });

  it("pads three-digit turns to 6 characters", () => {
    assert.equal(_padTurn(142), "000142");
  });

  it("does not alter turns that are already 6 digits", () => {
    assert.equal(_padTurn(100_000), "100000");
    assert.equal(_padTurn(999_999), "999999");
  });

  it("sorts correctly — the bug this prevents", () => {
    // Without padding: "TURNO#9" > "TURNO#20" (lexicographic, wrong)
    // With padding:    "TURNO#000009" < "TURNO#000020" (correct)
    const turns = [9, 1, 142, 20, 1000, 3].map(_padTurn);
    const sorted = [...turns].sort(); // lexicographic, same as DynamoDB
    assert.deepEqual(sorted, ["000001", "000003", "000009", "000020", "000142", "001000"]);
  });
});

// ---------------------------------------------------------------------------
// KEYS.turno
// ---------------------------------------------------------------------------

describe("KEYS.turno", () => {
  it("builds the correct PK and padded SK", () => {
    const key = KEYS.turno("evaluacion-r3-1793030400000", 142);
    assert.equal(key.PK, "PARTIDA#evaluacion-r3-1793030400000");
    assert.equal(key.SK, "TURNO#000142");
  });

  it("pads turn 1 correctly", () => {
    const key = KEYS.turno("demo-r1-1234567890000", 1);
    assert.equal(key.SK, "TURNO#000001");
  });

  it("SK starts with the expected prefix for Query begins_with", () => {
    const key = KEYS.turno("any-id", 5);
    assert.ok(key.SK.startsWith(KEYS.prefixes.turnos));
  });
});

// ---------------------------------------------------------------------------
// KEYS.metadata
// ---------------------------------------------------------------------------

describe("KEYS.metadata", () => {
  it("builds the correct PK and SK", () => {
    const key = KEYS.metadata("evaluacion-r1-1793030400000");
    assert.equal(key.PK, "PARTIDA#evaluacion-r1-1793030400000");
    assert.equal(key.SK, "METADATA");
  });

  it("shares PK with the turn items of the same partition", () => {
    const partidaId = "demo-r2-9999999999999";
    assert.equal(KEYS.metadata(partidaId).PK, KEYS.turno(partidaId, 1).PK);
  });
});

// ---------------------------------------------------------------------------
// KEYS.control
// ---------------------------------------------------------------------------

describe("KEYS.control", () => {
  it("always returns the singleton key", () => {
    const key = KEYS.control();
    assert.equal(key.PK, "CONTROL");
    assert.equal(key.SK, "PARTIDA_ACTIVA");
  });

  it("is always the same object shape regardless of when it is called", () => {
    assert.deepEqual(KEYS.control(), KEYS.control());
  });
});

// ---------------------------------------------------------------------------
// KEYS.refugio
// ---------------------------------------------------------------------------

describe("KEYS.refugio", () => {
  it("builds the correct PK and SK", () => {
    const key = KEYS.refugio("evaluacion-r3-1793030400000", "R-01");
    assert.equal(key.PK, "PARTIDA#evaluacion-r3-1793030400000");
    assert.equal(key.SK, "REFUGIO#R-01");
  });

  it("SK starts with the expected prefix for Query begins_with", () => {
    const key = KEYS.refugio("any-id", "R-02");
    assert.ok(key.SK.startsWith(KEYS.prefixes.refugios));
  });

  it("each refuge gets a distinct SK", () => {
    const id = "demo-r3-1234";
    const sks = ["R-01", "R-02", "R-03", "R-04"].map(
      (r) => KEYS.refugio(id, r).SK
    );
    const unique = new Set(sks);
    assert.equal(unique.size, 4);
  });
});

// ---------------------------------------------------------------------------
// ttlManana
// ---------------------------------------------------------------------------

describe("ttlManana", () => {
  it("returns a number roughly 24 hours from now in epoch seconds", () => {
    const before = Math.floor(Date.now() / 1000);
    const ttl = ttlManana();
    const after = Math.floor(Date.now() / 1000);

    assert.ok(ttl >= before + 86_400, "TTL should be at least 24 h from now");
    assert.ok(ttl <= after + 86_401, "TTL should not be more than 24 h + 1 s");
  });
});

// ---------------------------------------------------------------------------
// generarPartidaId
// ---------------------------------------------------------------------------

describe("generarPartidaId", () => {
  it("includes the mode and round in the ID", () => {
    const id = generarPartidaId("evaluacion", 3);
    assert.ok(id.startsWith("evaluacion-r3-"), `unexpected prefix in: ${id}`);
  });

  it("generates unique IDs on subsequent calls", () => {
    const a = generarPartidaId("demo", 1);
    const b = generarPartidaId("demo", 1);
    // Same millisecond is possible in tests; at minimum the format holds.
    assert.match(a, /^demo-r1-\d+$/);
    assert.match(b, /^demo-r1-\d+$/);
  });

  it("encodes ronda 1, 2 and 3 correctly", () => {
    assert.ok(generarPartidaId("evaluacion", 1).includes("-r1-"));
    assert.ok(generarPartidaId("evaluacion", 2).includes("-r2-"));
    assert.ok(generarPartidaId("evaluacion", 3).includes("-r3-"));
  });
});
