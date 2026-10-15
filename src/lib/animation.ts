/** Pure helpers shared by the dashboard App and the 3D viewer (no Vue/three imports). */

export interface PathFrame {
  name: string;
  matrix: number[][];
}

/** Filename stem used as the stable part id, e.g. "03_top_platform.obj" -> "03_top_platform". */
export function stemOf(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base.toLowerCase().endsWith(".obj") ? base.slice(0, -4) : base;
}

/** A planner frame matrix must be 4x4 with only finite numbers. */
export function isFiniteMatrix(m: unknown): m is number[][] {
  if (!Array.isArray(m) || m.length !== 4) return false;
  return m.every(
    (row) => Array.isArray(row) && row.length === 4 && row.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

/** Validate one artifact's decoded frames; returns the first bad index or -1 when clean. */
export function firstBadFrameIndex(frames: unknown): number {
  if (!Array.isArray(frames) || frames.length === 0) return 0;
  return frames.findIndex((f) => {
    if (typeof f !== "object" || f === null) return true;
    const { name, matrix } = f as { name?: unknown; matrix?: unknown };
    return typeof name !== "string" || !isFiniteMatrix(matrix);
  });
}

/** Flatten a row-major 4x4 matrix for THREE.Matrix4.set (which takes row-major arguments). */
export function flattenRowMajor(matrix: number[][]): number[] {
  return [matrix[0][0], matrix[0][1], matrix[0][2], matrix[0][3],
          matrix[1][0], matrix[1][1], matrix[1][2], matrix[1][3],
          matrix[2][0], matrix[2][1], matrix[2][2], matrix[2][3],
          matrix[3][0], matrix[3][1], matrix[3][2], matrix[3][3]];
}
