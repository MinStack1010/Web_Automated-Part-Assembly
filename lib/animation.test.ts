import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stemOf, isFiniteMatrix, firstBadFrameIndex, flattenRowMajor } from "./animation.ts";

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
