<template>
  <div class="flex h-screen bg-gray-950 text-white font-sans overflow-hidden">
    <div class="w-[450px] p-4 flex flex-col gap-4 bg-gray-900 border-r border-gray-800 overflow-y-auto custom-scrollbar">
      <div>
        <h1 class="text-xl font-bold text-blue-400">3D Assembly Panel</h1>
        <p class="text-xs text-gray-400">
          Backend: {{ sysStatus }} · Phase: <span class="text-emerald-300">{{ PHASE_LABEL[phase] }}</span>
          <span v-if="playback !== 'stopped'" class="text-green-300"> · Viewer: {{ playback }}</span>
        </p>
      </div>

      <!-- SECTION 1: UPLOAD -->
      <div class="space-y-2 p-3 bg-gray-800/50 rounded border border-gray-700">
        <h2 class="text-xs font-semibold text-gray-400 uppercase">1. Upload Models</h2>
        <input
          type="file"
          multiple
          ref="fileInputRef"
          accept=".obj"
          class="text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:bg-blue-600 file:text-white file:border-0 w-full"
        />
        <button
          @click="handleUpload"
          :disabled="phase === 'uploading'"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm font-medium"
        >
          {{ phase === "uploading" ? "Uploading…" : "Upload Files" }}
        </button>
        <div class="text-[10px] font-mono space-y-1 pt-1 text-gray-500">
          <div>
            Upload: <span class="text-gray-300">{{ uploadId || "—" }}</span>
          </div>
          <div v-if="models.length > 0">
            Models: <span class="text-gray-300">{{ models.map((m) => m.fileName).join(", ") }}</span>
          </div>
        </div>
      </div>

      <!-- SECTION 2: JOB CONFIGURATION -->
      <div class="space-y-2 bg-gray-800/20 p-3 rounded border border-gray-700/50">
        <h2 class="text-xs font-semibold text-gray-400 uppercase">2. Job Configuration</h2>
        <textarea
          v-model="payloadJson"
          class="w-full h-48 bg-black text-green-400 font-mono text-[11px] p-2 rounded border border-gray-700 resize-y outline-none custom-scrollbar"
          spellcheck="false"
        />
        <div class="flex gap-2 mt-2">
          <button
            @click="handleStartJob('joint-plan')"
            :disabled="isPolling || !uploadId"
            class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 rounded text-sm font-bold uppercase transition"
          >
            {{ isPolling ? `Polling… (${pollAttempt})` : "Join-Plan" }}
          </button>
          <button
            @click="handleStartJob('multi-plan')"
            :disabled="isPolling || !uploadId"
            class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 rounded text-sm font-bold uppercase transition"
          >
            {{ isPolling ? `Polling… (${pollAttempt})` : "Multi-Plan" }}
          </button>
        </div>
        <div v-if="jobId" class="text-[10px] font-mono text-gray-500">
          Job: <span class="text-yellow-300">{{ jobId }}</span> ({{ jobOperation || "?" }})
        </div>
      </div>

      <!-- JOB FAILURE DETAILS -->
      <div v-if="jobFailure" class="space-y-1 p-3 bg-red-950/60 rounded border border-red-700 text-xs">
        <h2 class="font-semibold text-red-300 uppercase">Job failed — no animation available</h2>
        <div class="font-mono text-[11px] space-y-0.5 text-red-100/90">
          <div>job_id: {{ jobFailure.jobId }}</div>
          <div>operation: {{ jobFailure.operation }} · status: {{ jobFailure.status }}</div>
          <div>code: {{ jobFailure.code }}</div>
          <div class="whitespace-pre-wrap">message: {{ jobFailure.message }}</div>
          <div>artifacts: {{ jobFailure.artifacts.length ? jobFailure.artifacts.join(", ") : "(none written)" }}</div>
        </div>
      </div>

      <!-- ARTIFACT / ANIMATION STATUS -->
      <div
        v-if="artifactProgress || animations.length > 0 || missingParts.length > 0"
        class="space-y-1 p-3 bg-gray-800/50 rounded border border-gray-700 text-xs"
      >
        <h2 class="font-semibold text-gray-300 uppercase">Animation paths</h2>
        <div v-if="artifactProgress" class="text-gray-400 font-mono text-[11px]">
          Loading artifacts: {{ artifactProgress.done }}/{{ artifactProgress.total }} — {{ artifactProgress.current }}
        </div>
        <div v-for="a in animations" :key="a.partId" class="font-mono text-[11px] text-emerald-300">
          ✓ {{ a.partId }} → {{ a.fileName }} ({{ a.frames.length }} frames, from {{ a.sourceArtifact }})
        </div>
        <div v-for="m in missingParts" :key="m" class="font-mono text-[11px] text-amber-300">
          ⚠ missing/invalid: {{ m }}
        </div>
      </div>

      <!-- JOB INSPECTOR -->
      <div class="space-y-2 p-3 bg-gray-800/50 rounded border border-gray-700 shrink-0">
        <h2 class="text-xs font-semibold text-gray-400 uppercase">Job Inspector</h2>
        <input
          type="text"
          v-model="jobIdInput"
          placeholder="Paste Job ID here..."
          class="w-full bg-black text-xs p-2 rounded border border-gray-700 outline-none text-yellow-400 font-mono"
        />
        <div class="grid grid-cols-2 gap-2 mt-1">
          <button @click="handleCheckStatus" class="py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs">
            Check Status
          </button>
          <button @click="handleGetResult" class="py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs">
            Get Result
          </button>
        </div>
        <button
          @click="handleCancelJob"
          class="w-full mt-2 py-2 px-3 bg-red-600 hover:bg-red-500 rounded text-xs font-medium transition-colors"
        >
          Cancel Job
        </button>
        <button
          @click="handleDownloadZip"
          class="w-full mt-2 py-2 px-3 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
        >
          Download Artifacts (ZIP)
        </button>
      </div>

      <!-- LOGS -->
      <div class="h-32 shrink-0">
        <div class="bg-black p-2 rounded h-full overflow-y-auto font-mono text-[11px] text-gray-300 space-y-1 border border-gray-800">
          <div v-for="(log, i) in logs" :key="i">{{ log }}</div>
        </div>
      </div>
    </div>

    <div class="flex-1 p-4 relative">
      <div
        v-if="isPolling"
        class="absolute top-8 left-8 z-10 bg-black/80 px-4 py-2 rounded border border-emerald-500 text-emerald-400 font-mono text-sm animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"
      >
        COMPUTING PATH / POLLING… ({{ pollAttempt }})
      </div>
      <ThreeScene
        :models="viewerModels"
        :animations="animations"
        @playback-change="playback = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import axios from "axios";
import ThreeScene, { type PartAnimation, type PlaybackState } from "./components/ThreeScene.vue";
import { stemOf, isFiniteMatrix } from "./lib/animation";

const API_BASE = "/backend";

type Phase =
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

interface JobFailure {
  jobId: string;
  operation: string;
  status: string;
  code: string;
  message: string;
  artifacts: string[];
}

interface LoadedModel {
  fileName: string;
  partId: string; // filename stem, e.g. "03_top_platform"
  url: string;
}

interface ArtifactProgress {
  done: number;
  total: number;
  current: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 400; // ~20 min, covers long physics jobs

const DEFAULT_PAYLOAD = {
  assembly: {
    collection: null,
    assembly_id: null,
    upload_id: "",
  },
  engine: "physics",
  sequence_planner: "queue",
  path_planner: "bfs",
  rotation: false,
  body_type: "bvh",
  sdf_dx: 0.05,
  sequence_max_time: 3600,
  path_max_time: 120,
  seed: 1,
  save_artifacts: true,
  n_save_states: 100,
  collision_threshold: 0.01,
  force_magnitude: 100,
  frame_skip: 100,
  max_collision: 0.01,
  adaptive_collision: false,
  step_size: 0.01,
  simplify: false,
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  "backend-down": "Backend unavailable",
  uploading: "Uploading models…",
  ready: "Models uploaded",
  submitting: "Submitting job…",
  planning: "Planning…",
  failed: "Job failed",
  validating: "Job done, validating result…",
  "loading-artifacts": "Loading artifacts…",
  "no-path": "No valid path data",
  "ready-to-play": "Ready to play animation",
};

const logs = ref<string[]>([]);
const sysStatus = ref("Checking...");
const phase = ref<Phase>("idle");
const playback = ref<PlaybackState>("stopped");

const uploadId = ref<string | null>(null);
const models = ref<LoadedModel[]>([]);
const payloadJson = ref(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
const jobId = ref<string | null>(null);
const jobOperation = ref<string>("");
const isPolling = ref(false);
const pollAttempt = ref(0);
const jobIdInput = ref<string>("");
const animations = ref<PartAnimation[]>([]);
const missingParts = ref<string[]>([]);
const artifactProgress = ref<ArtifactProgress | null>(null);
const jobFailure = ref<JobFailure | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let cancelled = false;

const viewerModels = computed(() => models.value.map((m) => ({ name: m.fileName, url: m.url })));

function addLog(msg: string) {
  logs.value = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...logs.value].slice(0, 30);
}

onMounted(() => {
  cancelled = false;
  const fetchHealth = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/health`, { timeout: 10000 });
      if (cancelled) return;
      sysStatus.value = data.status === "ok" ? "Online" : "Error";
      addLog(`Health: ${JSON.stringify(data)}`);
    } catch {
      if (cancelled) return;
      sysStatus.value = "Offline";
      phase.value = "backend-down";
      addLog("Failed to connect to backend.");
    }
  };
  void fetchHealth();
});

onBeforeUnmount(() => {
  cancelled = true;
  if (pollTimer) clearTimeout(pollTimer);
  // Release browser object URLs.
  models.value.forEach((m) => URL.revokeObjectURL(m.url));
  models.value = [];
});

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  isPolling.value = false;
}

function resetJobState() {
  stopPolling();
  jobId.value = null;
  jobOperation.value = "";
  animations.value = [];
  missingParts.value = [];
  artifactProgress.value = null;
  jobFailure.value = null;
  pollAttempt.value = 0;
  playback.value = "stopped";
}

async function handleUpload() {
  const files = fileInputRef.value?.files;
  if (!files?.length) {
    addLog("Please select OBJ files to upload.");
    return;
  }
  const objFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".obj"));
  if (objFiles.length < 2) {
    addLog(`Upload needs at least two .obj files (got ${objFiles.length}).`);
    return;
  }

  // A new upload invalidates the previous job's paths and animation.
  resetJobState();
  models.value.forEach((m) => URL.revokeObjectURL(m.url));
  models.value = [];

  const formData = new FormData();
  objFiles.forEach((file) => formData.append("files", file));
  phase.value = "uploading";

  try {
    addLog(`Uploading ${objFiles.length} files...`);
    const { data } = await axios.post(`${API_BASE}/api/v1/assemblies/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    const newUploadId: string | undefined = data.result?.source?.upload_id || data.upload_id;
    if (!newUploadId) throw new Error("Could not find upload_id in upload response");

    const loaded: LoadedModel[] = objFiles.map((file) => ({
      fileName: file.name,
      partId: stemOf(file.name),
      url: URL.createObjectURL(file),
    }));
    uploadId.value = newUploadId;
    models.value = loaded;
    phase.value = "ready";
    addLog(`Upload successful. ID: ${newUploadId} (${loaded.map((m) => m.fileName).join(", ")})`);

    try {
      const currentPayload = JSON.parse(payloadJson.value);
      currentPayload.assembly = { ...(currentPayload.assembly || {}), upload_id: newUploadId };
      payloadJson.value = JSON.stringify(currentPayload, null, 2);
    } catch {
      /* keep the user's JSON as-is; validated at submit time */
    }
  } catch (error: unknown) {
    phase.value = "idle";
    const msg = axios.isAxiosError(error)
      ? error.response
        ? `Upload failed (HTTP ${error.response.status}): ${JSON.stringify(error.response.data).slice(0, 200)}`
        : `Upload network error: ${error.message}`
      : `Upload error: ${String(error)}`;
    addLog(msg);
  }
}

async function handleStartJob(endpoint: "joint-plan" | "multi-plan") {
  let parsedPayload: Record<string, unknown>;
  try {
    parsedPayload = JSON.parse(payloadJson.value);
  } catch {
    addLog("Error: Invalid JSON payload in Job Config.");
    return;
  }
  if (!uploadId.value) {
    addLog("Error: Please upload the assembly first.");
    return;
  }
  if (isPolling.value) {
    addLog("A job request is already in flight; ignoring duplicate submit.");
    return;
  }

  // Join-Plan and Multi-Plan always use the original uploaded assembly.
  parsedPayload.assembly = { ...((parsedPayload.assembly as object) || {}), upload_id: uploadId.value };
  payloadJson.value = JSON.stringify(parsedPayload, null, 2);
  resetJobState();
  phase.value = "submitting";

  try {
    addLog(`Sending ${endpoint} with upload_id ${uploadId.value.slice(0, 8)}…`);
    const { data } = await axios.post(`${API_BASE}/api/v1/jobs/${endpoint}`, parsedPayload, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 60000,
    });
    const returnedJobId: string | undefined = data.job_id || data.result?.job_id;
    if (!returnedJobId) {
      phase.value = "ready";
      addLog("Error: Backend did not return a job_id.");
      return;
    }
    jobId.value = returnedJobId;
    jobOperation.value = endpoint;
    jobIdInput.value = returnedJobId;
    addLog(`Job created: ${returnedJobId}. Polling...`);
    void pollJob(returnedJobId, endpoint, 0);
  } catch (error: unknown) {
    phase.value = "ready";
    const msg = axios.isAxiosError(error)
      ? error.response
        ? `Job creation failed (HTTP ${error.response.status}): ${JSON.stringify(error.response.data).slice(0, 300)}`
        : `Job creation network error: ${error.message}`
      : `Job creation error: ${String(error)}`;
    addLog(msg);
  }
}

async function pollJob(id: string, endpoint: string, attempts: number) {
  if (cancelled) return;
  isPolling.value = true;
  phase.value = "planning";
  const attempt = attempts + 1;
  pollAttempt.value = attempt;

  const checkStatus = async () => {
    if (cancelled) return;
    try {
      const { data } = await axios.get(`${API_BASE}/api/v1/jobs/${id}`, { timeout: 30000 });
      const currentStatus: string | undefined = data.result?.status || data.status;
      addLog(`[Attempt ${attempt}] Job ${id.slice(0, 6)}… status: ${currentStatus}`);

      if (currentStatus === "completed") {
        stopPolling();
        await handleJobCompleted(id, endpoint);
      } else if (currentStatus === "failed" || currentStatus === "cancelled") {
        stopPolling();
        await handleJobFailed(id, endpoint, currentStatus);
      } else if (attempt >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        phase.value = "planning";
        addLog(`Stopped polling after ${MAX_POLL_ATTEMPTS} attempts; job is still ${currentStatus}. Check status manually.`);
      } else {
        pollTimer = setTimeout(() => void pollJob(id, endpoint, attempt), POLL_INTERVAL_MS);
      }
    } catch (error: unknown) {
      if (cancelled) return;
      // Transient network/proxy blips must not spawn duplicate jobs: just retry the status read.
      if (axios.isAxiosError(error) && !error.response && attempt < MAX_POLL_ATTEMPTS) {
        addLog(`Poll network blip (${error.message}). Retrying...`);
        pollTimer = setTimeout(() => void pollJob(id, endpoint, attempt), POLL_INTERVAL_MS);
      } else {
        stopPolling();
        addLog(`Polling error: ${axios.isAxiosError(error) ? error.message : String(error)}`);
      }
    }
  };

  await checkStatus();
}

async function handleJobFailed(id: string, endpoint: string, terminalStatus: string) {
  phase.value = "failed";
  // The snapshot carries status/artifacts; the detailed error comes from /result (409 + error body).
  let artifacts: string[] = [];
  try {
    const snap = await axios.get(`${API_BASE}/api/v1/jobs/${id}`, { timeout: 30000 });
    artifacts = snap.data?.result?.artifacts || [];
  } catch {
    /* snapshot is best-effort here */
  }
  let code = "JOB_FAILED";
  let message = `Job ${terminalStatus} without further detail.`;
  try {
    await axios.get(`${API_BASE}/api/v1/jobs/${id}/result`, { timeout: 30000 });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.error) {
      code = error.response.data.error.code || code;
      message = error.response.data.error.message || message;
    }
  }
  jobFailure.value = { jobId: id, operation: endpoint, status: terminalStatus, code, message, artifacts };
  addLog(`Job FAILED [${code}]: ${message}`);
  if (code === "NATIVE_PROCESS_CRASH") {
    addLog("No animation available: the native worker exited before writing any artifact.");
  }
}

async function fetchStepFrames(step: {
  id: string;
  move_id: string;
  artifact: string;
  frame_count: number;
  json_url: string;
  npy_url: string | null;
}): Promise<{ name: string; matrix: number[][] }[] | null> {
  // Primary: the JSON artifact the planner wrote.
  try {
    const { data } = await axios.get(`${API_BASE}${step.json_url}`, { timeout: 60000 });
    if (Array.isArray(data) && data.length > 0) return data;
    addLog(`Artifact ${step.artifact}: empty JSON array.`);
  } catch (error: unknown) {
    addLog(
      `Artifact ${step.artifact}: JSON fetch failed (${axios.isAxiosError(error) ? error.message : String(error)}). Trying .npy fallback…`
    );
  }
  // Fallback: the (N,4,4) .npy motion array (only used to recover/verify path data).
  if (!step.npy_url) return null;
  try {
    const npyjs = (await import("npyjs")).default;
    const reader = new npyjs();
    const parsed = await reader.load(`${API_BASE}${step.npy_url}`);
    const shape: number[] = parsed.shape;
    if (shape.length !== 3 || shape[1] !== 4 || shape[2] !== 4) {
      addLog(`Artifact ${step.artifact}: unexpected npy shape ${JSON.stringify(shape)}.`);
      return null;
    }
    const flat = parsed.data as unknown as ArrayLike<number>;
    const frames: { name: string; matrix: number[][] }[] = [];
    for (let f = 0; f < shape[0]; f++) {
      const matrix: number[][] = [];
      for (let r = 0; r < 4; r++) {
        const row: number[] = [];
        for (let c = 0; c < 4; c++) row.push(Number(flat[f * 16 + r * 4 + c]));
        matrix.push(row);
      }
      frames.push({ name: step.move_id, matrix });
    }
    addLog(`Artifact ${step.artifact}: recovered ${frames.length} frames from .npy.`);
    return frames;
  } catch (error: unknown) {
    addLog(`Artifact ${step.artifact}: .npy fallback failed (${String(error).slice(0, 160)}).`);
    return null;
  }
}

async function handleJobCompleted(id: string, endpoint: string) {
  phase.value = "validating";
  addLog("Job completed! Validating result and loading animation…");
  try {
    const resultReq = await axios.get(`${API_BASE}/api/v1/jobs/${id}/result`, { timeout: 30000 });
    const snapshot = resultReq.data?.result || {};
    const artifacts: string[] = snapshot.artifacts || [];
    if (snapshot.status !== "completed" || artifacts.length === 0) {
      phase.value = "no-path";
      addLog(`Result has no usable artifacts (status=${snapshot.status}, artifacts=${artifacts.length}). Nothing to animate.`);
      return;
    }

    const animReq = await axios.get(`${API_BASE}/api/v1/jobs/${id}/animation`, { timeout: 30000 });
    const manifest = animReq.data?.result;
    if (!manifest || !Array.isArray(manifest.steps) || manifest.steps.length === 0) {
      phase.value = "no-path";
      addLog("Animation manifest is empty. Nothing to animate.");
      return;
    }

    // Map each step's move_id to the uploaded model by OBJ filename stem.
    // Upload order is NOT assumed to match planner order.
    const byStem = new Map<string, number>();
    models.value.forEach((m, idx) => {
      if (!byStem.has(m.partId)) byStem.set(m.partId, idx);
    });

    phase.value = "loading-artifacts";
    const total = manifest.steps.length;
    const loadedAnims: PartAnimation[] = [];
    const missing: string[] = [];
    for (let i = 0; i < total; i++) {
      const step = manifest.steps[i];
      artifactProgress.value = { done: i, total, current: step.artifact };
      const modelIndex = byStem.get(String(step.move_id));
      if (modelIndex === undefined) {
        missing.push(`${step.move_id} (artifact ${step.artifact})`);
        addLog(`No uploaded model matches part "${step.move_id}" — skipping its path.`);
        continue;
      }
      const frames = await fetchStepFrames(step);
      if (!frames || frames.length === 0) {
        missing.push(`${step.move_id} (artifact ${step.artifact}: unreadable)`);
        continue;
      }
      const bad = frames.findIndex((f) => f.name === undefined || !isFiniteMatrix(f.matrix));
      if (bad !== -1) {
        missing.push(`${step.move_id} (artifact ${step.artifact}: invalid frame ${bad})`);
        addLog(`Artifact ${step.artifact}: frame ${bad} is malformed (needs 4x4 finite matrix). Skipped.`);
        continue;
      }
      loadedAnims.push({
        partId: String(step.move_id),
        modelIndex,
        fileName: models.value[modelIndex].fileName,
        sourceArtifact: String(step.artifact),
        frames: frames.map((f) => ({ matrix: f.matrix })),
      });
      addLog(`Decoded ${frames.length} frames for "${step.move_id}" from ${step.artifact}.`);
    }
    artifactProgress.value = { done: total, total, current: "done" };

    if (loadedAnims.length === 0) {
      phase.value = "no-path";
      addLog("No valid path survived validation. Nothing to animate.");
      return;
    }
    // Keep backend manifest order: multi-plan steps are already sorted by
    // sequence_index, which defines the faithful playback order.
    animations.value = loadedAnims;
    missingParts.value = missing;
    phase.value = "ready-to-play";
    const op = endpoint === "multi-plan" ? "Multi-Plan" : "Join-Plan";
    addLog(
      `${op}: ${loadedAnims.length}/${total} path(s) ready (${loadedAnims.map((a) => a.partId).join(", ")}).` +
        (missing.length ? ` Missing: ${missing.join("; ")}.` : " Press Play in the viewer.")
    );
  } catch (error: unknown) {
    phase.value = "no-path";
    addLog(`Error processing result: ${axios.isAxiosError(error) ? error.message : String(error)}`);
  }
}

async function handleCheckStatus() {
  if (!jobIdInput.value) return addLog("Please enter a Job ID.");
  try {
    const { data } = await axios.get(`${API_BASE}/api/v1/jobs/${jobIdInput.value}`, { timeout: 30000 });
    const currentStatus = data.result?.status || data.status;
    addLog(`Status [${jobIdInput.value.substring(0, 8)}]: ${currentStatus}`);
  } catch (error: unknown) {
    addLog(`Status error: ${axios.isAxiosError(error) ? error.message : String(error)}`);
  }
}

async function handleGetResult() {
  if (!jobIdInput.value) return addLog("Please enter a Job ID.");
  try {
    const { data } = await axios.get(`${API_BASE}/api/v1/jobs/${jobIdInput.value}/result`, { timeout: 30000 });
    addLog(`Result: ${JSON.stringify(data).substring(0, 120)}...`);
    console.log("Full Result:", data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      addLog(`Result HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    } else {
      addLog(`Result error: ${String(error)}`);
    }
  }
}

async function handleCancelJob() {
  if (!jobIdInput.value) return addLog("Please enter a Job ID.");
  try {
    await axios.delete(`${API_BASE}/api/v1/jobs/${jobIdInput.value}`, { timeout: 30000 });
    addLog(`Job ${jobIdInput.value.substring(0, 8)} cancelled successfully.`);
    stopPolling();
    phase.value = "failed";
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      addLog(`Cancel job HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    } else {
      addLog(`Cancel job error: ${String(error)}`);
    }
  }
}

function handleDownloadZip() {
  if (!jobIdInput.value) return addLog("Job ID is required to download ZIP.");
  window.open(`${API_BASE}/api/v1/jobs/${jobIdInput.value}/artifacts.zip`, "_blank");
  addLog(`Downloading artifacts.zip for job ${jobIdInput.value.slice(0, 8)}`);
}
</script>
