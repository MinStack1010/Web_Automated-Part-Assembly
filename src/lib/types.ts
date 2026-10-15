/** Shared dashboard/viewer types (no Vue/three imports so plain TS modules can use them). */

export type Phase =
  | "idle"
  | "backend-down"
  | "uploading"
  | "ready"
  | "submitting"
  | "planning"
  | "failed"
  | "validating"
  | "loading-artifacts"
  | "no-path"
  | "ready-to-play";

export const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  "backend-down": "Backend unavailable",
  uploading: "Uploading parts…",
  ready: "Parts uploaded",
  submitting: "Submitting…",
  planning: "Planning…",
  failed: "Failed",
  validating: "Validating result…",
  "loading-artifacts": "Loading motion paths…",
  "no-path": "No path data",
  "ready-to-play": "Ready to play",
};

export type PlaybackState = "stopped" | "playing" | "paused" | "ended";

export interface AnimationFrame {
  /** Row-major 4x4 world transform from the planner's path.json. */
  matrix: number[][];
}

export interface PartAnimation {
  partId: string;
  modelIndex: number;
  fileName: string;
  /** `o` sub-mesh to move inside a shared file; null = move the whole model. */
  objectName: string | null;
  sourceArtifact: string;
  frames: AnimationFrame[];
}

export interface ViewerModel {
  name: string;
  url: string;
  /** `o` sub-mesh contained in this file; null = the whole file is one part. */
  objectName: string | null;
}

export interface LoadedModel {
  fileName: string;
  /** backend part id (upload response), e.g. "03_top_platform" */
  partId: string;
  url: string;
  /** `o` sub-mesh contained in this file; null = the whole file is one part. */
  objectName: string | null;
}

export interface MeshBindInfo {
  partId: string;
  modelIndex: number;
  meshCount: number;
  objectName: string;
  fileName: string;
}

export interface MeshMissingInfo {
  partId: string;
  modelIndex: number;
  objectName: string;
  fileName: string;
  childrenFound: string[];
}

export interface JobFailure {
  jobId: string;
  operation: string;
  status: string;
  code: string;
  message: string;
  artifacts: string[];
}

export interface ArtifactProgress {
  done: number;
  total: number;
  current: string;
}
