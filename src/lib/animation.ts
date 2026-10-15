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

/** Reserved stems the backend rewrites (mirror of _RESERVED_PART_STEMS). */
const RESERVED_PART_STEMS = new Set(["assembly", "translation"]);

/**
 * Mirror of the backend `_sanitize_part_name` core rule (minus the
 * uniqueness suffix, which cannot be reproduced without sibling names).
 * Used to match a parsed OBJ child name against a backend part id when the
 * names differ only by unsafe characters (e.g. child "my part" vs id "my_part").
 */
export function sanitizeObjectName(raw: string): string {
  let cleaned = (raw ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  if (!cleaned || !/^[A-Za-z0-9]/.test(cleaned)) cleaned = cleaned ? `part_${cleaned}` : "part";
  if (RESERVED_PART_STEMS.has(cleaned)) cleaned = `part_${cleaned}`;
  return cleaned;
}

/**
 * Match parsed OBJ child names against one backend part id. An exact match
 * wins; otherwise the backend sanitize rule applied to the child name must
 * hit. Returns every matching child name (usually one).
 */
export function matchObjectNames(childNames: string[], partId: string): string[] {
  const exact = childNames.filter((n) => n === partId);
  if (exact.length > 0) return exact;
  return childNames.filter((n) => sanitizeObjectName(n) === partId);
}

export interface UploadedFile {
  fileName: string;
  url: string;
}

export interface RegisteredModel {
  fileName: string;
  partId: string;
  url: string;
  /** `o` object name to animate inside a shared file; null = the whole file is the part. */
  objectName: string | null;
}

/**
 * Build one viewer model per backend part id.
 *
 * Multi-file uploads keep the historical behavior (each file is one part).
 * A single file carrying several parts (backend `part_ids` not matching any
 * filename stem) yields one entry per part sharing the file URL, with
 * `objectName` set so the viewer animates only the matching sub-mesh.
 * Part ids matching no file are returned as `unmapped`, never guessed.
 */
export function registerModels(
  files: UploadedFile[],
  partIds: string[],
  userMapping?: Record<string, string>
): { models: RegisteredModel[]; unmapped: string[] } {
  const byStem = new Map<string, UploadedFile>();
  for (const f of files) {
    const stem = stemOf(f.fileName);
    if (!byStem.has(stem)) byStem.set(stem, f);
  }
  const singleFile = files.length === 1 ? files[0] : null;
  const models: RegisteredModel[] = [];
  const unmapped: string[] = [];

  // If user mapping is provided, build reverse lookup: partId -> objectName
  const reverseMapping = userMapping
    ? new Map<string, string>()
    : null;
  if (userMapping && reverseMapping) {
    for (const [objectName, partId] of Object.entries(userMapping)) {
      reverseMapping.set(partId, objectName);
    }
  }

  for (const partId of partIds) {
    // Check user mapping first
    if (reverseMapping && reverseMapping.has(partId)) {
      const objectName = reverseMapping.get(partId)!;
      if (singleFile) {
        models.push({ fileName: singleFile.fileName, partId, url: singleFile.url, objectName });
        continue;
      }
    }

    const direct = byStem.get(partId);
    if (direct) {
      models.push({ fileName: direct.fileName, partId, url: direct.url, objectName: null });
    } else if (singleFile) {
      models.push({ fileName: singleFile.fileName, partId, url: singleFile.url, objectName: partId });
    } else {
      unmapped.push(partId);
    }
  }
  return { models, unmapped };
}

/** Flatten a row-major 4x4 matrix for THREE.Matrix4.set (which takes row-major arguments). */
export function flattenRowMajor(matrix: number[][]): number[] {
  return [matrix[0][0], matrix[0][1], matrix[0][2], matrix[0][3],
          matrix[1][0], matrix[1][1], matrix[1][2], matrix[1][3],
          matrix[2][0], matrix[2][1], matrix[2][2], matrix[2][3],
          matrix[3][0], matrix[3][1], matrix[3][2], matrix[3][3]];
}
