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
  sourceArtifact: string;
  frames: AnimationFrame[];
}

export interface ViewerModel {
  name: string;
  url: string;
}

export interface LoadedModel {
  fileName: string;
  /** filename stem, e.g. "03_top_platform" */
  partId: string;
  url: string;
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
