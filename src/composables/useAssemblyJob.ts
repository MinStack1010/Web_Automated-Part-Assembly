import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import axios from "axios";
import { API_BASE } from "../lib/api";
import { stemOf, isFiniteMatrix } from "../lib/animation";
import type {
  ArtifactProgress,
  JobFailure,
  LoadedModel,
  PartAnimation,
  Phase,
  PlaybackState,
  ViewerModel,
} from "../lib/types";

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

/**
 * All dashboard business logic: upload → joint-plan/multi-plan → poll → validate →
 * load artifacts (JSON + .npy fallback) → expose animation tracks to the viewer.
 */
export function useAssemblyJob() {
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

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const viewerModels = computed<ViewerModel[]>(() =>
    models.value.map((m) => ({ name: m.fileName, url: m.url }))
  );
  const modelNames = computed(() => models.value.map((m) => m.fileName));

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

  async function handleUpload(files: File[]) {
    if (!files.length) {
      addLog("Please select .obj part files to upload.");
      return;
    }
    const objFiles = files.filter((f) => f.name.toLowerCase().endsWith(".obj"));
    if (objFiles.length < 2) {
      addLog(`Upload needs at least two .obj parts (got ${objFiles.length}).`);
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
      addLog("Error: Please upload the parts first.");
      return;
    }
    if (isPolling.value) {
      addLog("A task is already in flight; ignoring duplicate submit.");
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
        addLog("Error: Backend did not return a task id.");
        return;
      }
      jobId.value = returnedJobId;
      jobOperation.value = endpoint;
      jobIdInput.value = returnedJobId;
      addLog(`Task created: ${returnedJobId}. Polling...`);
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
        addLog(`[Attempt ${attempt}] Task ${id.slice(0, 6)}… status: ${currentStatus}`);

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
    let message = `Task ${terminalStatus} without further detail.`;
    try {
      await axios.get(`${API_BASE}/api/v1/jobs/${id}/result`, { timeout: 30000 });
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        code = error.response.data.error.code || code;
        message = error.response.data.error.message || message;
      }
    }
    jobFailure.value = { jobId: id, operation: endpoint, status: terminalStatus, code, message, artifacts };
    addLog(`Task FAILED [${code}]: ${message}`);
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
    addLog("Task completed! Validating result and loading motion paths…");
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
          (missing.length ? ` Missing: ${missing.join("; ")}.` : " Press Play in the player.")
      );
    } catch (error: unknown) {
      phase.value = "no-path";
      addLog(`Error processing result: ${axios.isAxiosError(error) ? error.message : String(error)}`);
    }
  }

  async function handleCheckStatus() {
    if (!jobIdInput.value) return addLog("Please enter a Task ID.");
    try {
      const { data } = await axios.get(`${API_BASE}/api/v1/jobs/${jobIdInput.value}`, { timeout: 30000 });
      const currentStatus = data.result?.status || data.status;
      addLog(`Status [${jobIdInput.value.substring(0, 8)}]: ${currentStatus}`);
    } catch (error: unknown) {
      addLog(`Status error: ${axios.isAxiosError(error) ? error.message : String(error)}`);
    }
  }

  async function handleGetResult() {
    if (!jobIdInput.value) return addLog("Please enter a Task ID.");
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
    if (!jobIdInput.value) return addLog("Please enter a Task ID.");
    try {
      await axios.delete(`${API_BASE}/api/v1/jobs/${jobIdInput.value}`, { timeout: 30000 });
      addLog(`Task ${jobIdInput.value.substring(0, 8)} cancelled successfully.`);
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
    if (!jobIdInput.value) return addLog("Task ID is required to download the ZIP.");
    window.open(`${API_BASE}/api/v1/jobs/${jobIdInput.value}/artifacts.zip`, "_blank");
    addLog(`Downloading artifacts.zip for job ${jobIdInput.value.slice(0, 8)}`);
  }

  return {
    logs,
    sysStatus,
    phase,
    playback,
    uploadId,
    models,
    modelNames,
    viewerModels,
    payloadJson,
    jobId,
    jobOperation,
    isPolling,
    pollAttempt,
    jobIdInput,
    animations,
    missingParts,
    artifactProgress,
    jobFailure,
    addLog,
    handleUpload,
    handleStartJob,
    handleCheckStatus,
    handleGetResult,
    handleCancelJob,
    handleDownloadZip,
  };
}
