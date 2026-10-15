<template>
  <div class="w-full h-full bg-surface rounded-[10px] overflow-hidden border border-black/10 relative shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
    <!-- Playback status -->
    <div class="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 max-w-[70%]">
      <div
        v-if="playback === 'playing'"
        class="app-card px-3 py-1.5 flex items-center gap-2 text-success"
      >
        <span class="w-2 h-2 bg-success rounded-full animate-pulse"></span>
        <span class="text-[11px] font-semibold uppercase tracking-wide">
          Playing · {{ totalFrames }} steps · {{ animations.length }}
          part{{ animations.length > 1 ? "s" : "" }}
        </span>
      </div>
      <div v-else-if="playback === 'paused'" class="app-card px-3 py-1.5 text-warning">
        <span class="text-[11px] font-semibold uppercase tracking-wide">Paused — pose held</span>
      </div>
      <div v-else-if="playback === 'ended'" class="app-card px-3 py-1.5 text-primary">
        <span class="text-[11px] font-semibold uppercase tracking-wide">
          Ended — assembled pose held
        </span>
      </div>
      <div
        v-for="a in animations"
        :key="a.partId"
        class="app-card px-3 py-1 mono text-[11px] text-carbon"
      >
        {{ a.partId }} <span class="text-black/40">→</span> {{ a.fileName }}
        <span class="text-black/45">({{ a.frames.length }} steps)</span>
      </div>
    </div>

    <!-- Player controls -->
    <div v-if="animations.length > 0" class="absolute top-4 left-4 z-10 flex gap-2">
      <button
        v-if="playback === 'stopped' || playback === 'ended'"
        @click="handlePlay"
        class="btn btn-primary btn-sm"
      >
        <span class="material-icons text-[15px]">play_arrow</span>
        {{ playback === "ended" ? "Replay" : "Play" }}
      </button>
      <button
        v-if="playback === 'playing'"
        @click="handlePause"
        class="btn btn-warning btn-sm"
      >
        <span class="material-icons text-[15px]">pause</span>
        Pause
      </button>
      <button
        v-if="playback === 'paused'"
        @click="handleResume"
        class="btn btn-primary btn-sm"
      >
        <span class="material-icons text-[15px]">play_arrow</span>
        Resume
      </button>
      <button
        v-if="playback === 'playing' || playback === 'paused' || playback === 'ended'"
        @click="handleReset"
        class="btn btn-outline btn-sm"
      >
        <span class="material-icons text-[15px]">restart_alt</span>
        Reset
      </button>
    </div>

    <!-- Empty stage hint (no parts loaded — stage stays grid + lights only) -->
    <div
      v-if="models.length === 0"
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      <div class="app-card px-6 py-5 text-center space-y-1.5">
        <span class="material-icons text-lightgrey text-3xl">view_in_ar</span>
        <p class="text-[13px] font-semibold text-carbon">Empty stage</p>
        <p class="text-[11px] text-black/45 max-w-[220px]">
          Upload parts to preview the assembly sequence.
        </p>
      </div>
    </div>

    <div ref="containerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { viewer } from "../../libs/3d/viewer";
import { flattenRowMajor } from "../../lib/animation";
import type { PartAnimation, PlaybackState, ViewerModel } from "../../lib/types";

const props = defineProps<{
  models: ViewerModel[];
  animations: PartAnimation[];
}>();

const emit = defineEmits<{
  (e: "playback-change", s: PlaybackState): void;
}>();

const FRAMES_PER_SECOND = 30;

interface DecodedPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** Decompose a row-major 4x4 planner matrix into position + rotation (scale is ignored: planner outputs rigid transforms). */
function decodeMatrix(matrix: number[][]): DecodedPose {
  const m = new THREE.Matrix4();
  m.set(...(flattenRowMajor(matrix) as [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ]));
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat };
}

/** Sample the frame track at time t (seconds) with lerp/slerp between keyframes. */
function sampleTrack(
  poses: DecodedPose[],
  t: number,
  duration: number,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion
) {
  const n = poses.length;
  if (n === 1 || duration <= 0) {
    outPos.copy(poses[0].pos);
    outQuat.copy(poses[0].quat);
    return;
  }
  const clamped = Math.min(Math.max(t, 0), duration);
  const f = (clamped / duration) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const alpha = f - i;
  outPos.lerpVectors(poses[i].pos, poses[i + 1].pos, alpha);
  outQuat.slerpQuaternions(poses[i].quat, poses[i + 1].quat, alpha);
}

const containerRef = ref<HTMLDivElement | null>(null);
const playback = ref<PlaybackState>("stopped");

const stepDuration = computed(() => {
  const maxFrames = props.animations.reduce((m, a) => Math.max(m, a.frames.length), 0);
  if (maxFrames === 0) return 0;
  return Math.max(3, maxFrames / FRAMES_PER_SECOND);
});
const duration = computed(() => stepDuration.value * Math.max(props.animations.length, 1));
const totalFrames = computed(() => props.animations.reduce((m, a) => Math.max(m, a.frames.length), 0));

// Step order follows the manifest (multi-plan sequence_index): part k moves during [k*stepDuration, (k+1)*stepDuration].
const orderOf = computed(() => {
  const map = new Map<number, number>();
  props.animations.forEach((a, order) => map.set(a.modelIndex, order));
  return map;
});

const posesByModel = computed(() => {
  const map = new Map<number, DecodedPose[]>();
  props.animations.forEach((a) => {
    if (a.frames.length > 0) map.set(a.modelIndex, a.frames.map((f) => decodeMatrix(f.matrix)));
  });
  return map;
});

function setState(s: PlaybackState) {
  playback.value = s;
  emit("playback-change", s);
}

// ---- three.js core lives in the ported client viewer singleton (src/libs/3d/viewer.ts) ----
let loadToken = 0;
let clockTime = 0;
const groups = new Map<number, THREE.Group>();
const fittedObjects: THREE.Object3D[] = [];
let resizeObserver: ResizeObserver | null = null;
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

function applyPose(modelIndex: number, t: number, dur: number) {
  const g = groups.get(modelIndex);
  const poses = posesByModel.value.get(modelIndex);
  if (!g || !poses || poses.length === 0) return;
  sampleTrack(poses, t, dur, tmpPos, tmpQuat);
  // NOTE: no display scale or centering here — planner coordinates apply 1:1.
  g.position.copy(tmpPos);
  g.quaternion.copy(tmpQuat);
}

function applyFirstFrames() {
  const dur = stepDuration.value;
  for (const idx of groups.keys()) applyPose(idx, 0, dur);
}

/** Frame the camera on the true (unscaled, uncentered) model bounds. */
function fitCamera() {
  const camera = viewer.camera;
  const controls = viewer.controls;
  if (!camera || !controls || fittedObjects.length === 0) return;
  const box = new THREE.Box3();
  fittedObjects.forEach((o) => box.expandByObject(o));
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(center);
  if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
  dir.normalize();
  camera.position.copy(center).addScaledVector(dir, Math.max(size * 1.4, 1));
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

/** Scale the client's default 10-unit grid to the loaded assembly bounds. */
function fitGrid() {
  if (fittedObjects.length === 0) return;
  const box = new THREE.Box3();
  fittedObjects.forEach((o) => box.expandByObject(o));
  if (box.isEmpty()) return;
  const { x, y, z } = box.getSize(new THREE.Vector3());
  const span = Math.max(x, y, z, 1);
  const size = Math.pow(10, Math.ceil(Math.log10(span * 2)));
  // ~10 grid cells across the assembly, matching the client's 10-unit / 25-division feel.
  const divisions = Math.min(100, Math.max(10, Math.round((size / span) * 10)));
  viewer.setGrid(size, divisions);
}

function clearModels() {
  for (const [, g] of groups) {
    viewer.scene?.remove(g);
    g.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }
  groups.clear();
  fittedObjects.length = 0;
}

async function loadModels() {
  if (!viewer.scene) return;
  const token = ++loadToken;
  clearModels();
  const loader = new OBJLoader();
  await Promise.all(
    props.models.map(async (m, idx) => {
      try {
        const obj = await loader.loadAsync(m.url);
        if (token !== loadToken) return; // superseded by a newer upload
        const group = new THREE.Group();
        group.add(obj.clone());
        viewer.scene!.add(group);
        groups.set(idx, group);
        fittedObjects.push(group);
        // Show the assembled (first-frame) pose immediately, matching R3F behaviour.
        applyPose(idx, 0, stepDuration.value);
        if (token === loadToken) {
          fitGrid();
          fitCamera();
        }
      } catch (err) {
        console.error(`Failed to load part ${m.name}:`, err);
      }
    })
  );
}

function tick(dt: number) {
  if (playback.value === "playing") {
    clockTime += dt;
    if (clockTime >= duration.value) {
      clockTime = duration.value; // hold the final assembled pose
      setState("ended");
    } else {
      const dur = stepDuration.value;
      for (const [idx] of groups) {
        const offset = (orderOf.value.get(idx) ?? 0) * dur;
        // Sequential semantics: this part moves during [timeOffset, timeOffset+stepDuration].
        const local = Math.min(Math.max(clockTime - offset, 0), dur);
        applyPose(idx, local, dur);
      }
    }
  }
}

function initViewer() {
  const container = containerRef.value;
  if (!container || viewer.renderer) return;
  viewer.initRenderer(container.clientWidth, container.clientHeight);
  container.appendChild(viewer.renderer!.domElement);
  viewer.initDefaultScene();

  resizeObserver = new ResizeObserver(() => {
    viewer.resize(container.clientWidth, container.clientHeight);
  });
  resizeObserver.observe(container);

  viewer.startLoop(tick);
  void loadModels();
}

function disposeViewer() {
  loadToken++;
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearModels();
  viewer.dispose();
}

watch(
  () => props.models.map((m) => m.url).join("|"),
  () => {
    void loadModels();
  }
);

watch(
  () => props.animations,
  () => {
    // New animation data arrives: stop and reset to the assembled pose.
    clockTime = 0;
    setState("stopped");
    applyFirstFrames();
  },
  { deep: true }
);

onMounted(() => {
  initViewer();
});

onBeforeUnmount(() => {
  disposeViewer();
});

function handlePlay() {
  if (props.animations.length === 0 || duration.value <= 0) return;
  clockTime = 0; // (re)play from the first frame; parts stay loaded
  applyFirstFrames();
  setState("playing");
}

function handlePause() {
  setState("paused");
}

function handleResume() {
  setState("playing");
}

function handleReset() {
  clockTime = 0;
  applyFirstFrames();
  setState("stopped");
}
</script>
