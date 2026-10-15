import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stemOf, isFiniteMatrix, firstBadFrameIndex, flattenRowMajor, sanitizeObjectName, matchObjectNames, registerModels } from "./animation.ts";

const IDENTITY = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

describe("stemOf", () => {
  it("maps OBJ filenames to backend part ids", () => {
    assert.equal(stemOf("03_top_platform.obj"), "03_top_platform");
    assert.equal(stemOf("twist_cap.obj"), "twist_cap");
  });
  it("leaves non-OBJ names untouched", () => {
    assert.equal(stemOf("translation.json"), "translation.json");
  });
});

describe("isFiniteMatrix", () => {
  it("accepts a real planner matrix", () => {
    assert.equal(isFiniteMatrix(IDENTITY), true);
  });
  it("rejects wrong shapes", () => {
    assert.equal(isFiniteMatrix([[1, 2], [3, 4]]), false);
    assert.equal(isFiniteMatrix("path"), false);
    assert.equal(isFiniteMatrix(null), false);
  });
  it("rejects non-finite values", () => {
    const bad = IDENTITY.map((r) => [...r]);
    bad[0][3] = Number.NaN;
    assert.equal(isFiniteMatrix(bad), false);
    const inf = IDENTITY.map((r) => [...r]);
    inf[1][3] = Number.POSITIVE_INFINITY;
    assert.equal(isFiniteMatrix(inf), false);
  });
});

describe("firstBadFrameIndex", () => {
  it("accepts the backend path.json contract", () => {
    const frames = [
      { name: "03_top_platform", matrix: IDENTITY },
      { name: "03_top_platform", matrix: IDENTITY.map((r) => [...r]) },
    ];
    assert.equal(firstBadFrameIndex(frames), -1);
  });
  it("flags empty, missing-name, and malformed-matrix frames", () => {
    assert.equal(firstBadFrameIndex([]), 0);
    assert.equal(firstBadFrameIndex([{ matrix: IDENTITY }]), 0);
    assert.equal(firstBadFrameIndex([{ name: "a", matrix: IDENTITY }, { name: "a", matrix: [[1]] }]), 1);
  });
});

describe("sanitizeObjectName", () => {
  it("mirrors the backend rule for unsafe characters", () => {
    assert.equal(sanitizeObjectName("my part"), "my_part");
    assert.equal(sanitizeObjectName("  pin  "), "pin");
    assert.equal(sanitizeObjectName(""), "part");
  });
  it("rewrites reserved stems like the backend", () => {
    assert.equal(sanitizeObjectName("assembly"), "part_assembly");
  });
});

describe("matchObjectNames", () => {
  it("prefers exact matches (pin/bushing case)", () => {
    assert.deepEqual(matchObjectNames(["bushing", "pin"], "bushing"), ["bushing"]);
    assert.deepEqual(matchObjectNames(["bushing", "pin"], "pin"), ["pin"]);
  });
  it("falls back to the sanitize rule", () => {
    assert.deepEqual(matchObjectNames(["my part"], "my_part"), ["my part"]);
  });
  it("returns empty when nothing matches", () => {
    assert.deepEqual(matchObjectNames(["bushing", "pin"], "washer"), []);
    assert.deepEqual(matchObjectNames([], "pin"), []);
  });
});

describe("registerModels", () => {
  it("registers one entry per part sharing a single multi-mesh file", () => {
    const { models, unmapped } = registerModels(
      [{ fileName: "assembly_model.obj", url: "blob:one" }],
      ["bushing", "pin"]
    );
    assert.deepEqual(unmapped, []);
    assert.equal(models.length, 2);
    assert.deepEqual(models[0], {
      fileName: "assembly_model.obj",
      partId: "bushing",
      url: "blob:one",
      objectName: "bushing",
    });
    assert.deepEqual(models[1].objectName, "pin");
  });
  it("keeps whole-file entries for separate per-part uploads", () => {
    const { models, unmapped } = registerModels(
      [
        { fileName: "pin.obj", url: "blob:pin" },
        { fileName: "bushing.obj", url: "blob:bushing" },
      ],
      ["pin", "bushing"]
    );
    assert.deepEqual(unmapped, []);
    assert.deepEqual(
      models.map((m) => [m.partId, m.url, m.objectName]),
      [
        ["pin", "blob:pin", null],
        ["bushing", "blob:bushing", null],
      ]
    );
  });
  it("never guesses when a part matches no file", () => {
    const { models, unmapped } = registerModels(
      [
        { fileName: "a.obj", url: "blob:a" },
        { fileName: "b.obj", url: "blob:b" },
      ],
      ["a", "zzz_unknown"]
    );
    assert.equal(models.length, 1);
    assert.deepEqual(unmapped, ["zzz_unknown"]);
  });
});

describe("flattenRowMajor", () => {
  it("preserves translation in elements 3/7/11 for Matrix4.set", () => {
    const m = IDENTITY.map((r) => [...r]);
    m[0][3] = -2.517;
    m[1][3] = -2.803;
    m[2][3] = -0.4;
    const flat = flattenRowMajor(m);
    assert.equal(flat.length, 16);
    assert.deepEqual([flat[3], flat[7], flat[11]], [-2.517, -2.803, -0.4]);
  });
});
