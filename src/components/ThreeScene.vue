<template>
  <div class="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700 relative">
    <div class="absolute bottom-4 left-4 z-10 flex flex-col gap-1 max-w-[70%]">
      <div
        v-if="playback === 'playing'"
        class="bg-black/60 px-3 py-1 rounded text-green-400 font-mono text-xs border border-green-500/30 flex items-center gap-2"
      >
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        PLAYING ANIMATION ({{ totalFrames }} frames, {{ animations.length }} part{{ animations.length > 1 ? "s" : "" }})
      </div>
      <div
        v-if="playback === 'paused'"
        class="bg-black/60 px-3 py-1 rounded text-amber-300 font-mono text-xs border border-amber-500/30"
      >
        PAUSED — pose held
      </div>
      <div
        v-if="playback === 'ended'"
        class="bg-black/60 px-3 py-1 rounded text-blue-300 font-mono text-xs border border-blue-500/30"
      >
        ENDED — final assembled pose held
      </div>
      <div
        v-for="a in animations"
        :key="a.partId"
        class="bg-black/60 px-3 py-1 rounded text-gray-300 font-mono text-[11px] border border-gray-600/30"
      >
        {{ a.partId }} → {{ a.fileName }} ({{ a.frames.length }} frames)
      </div>
    </div>

    <div v-if="animations.length > 0" class="absolute top-4 left-4 z-10 flex gap-2">
      <button
        v-if="playback === 'stopped' || playback === 'ended'"
        @click="handlePlay"
        class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold"
      >
        {{ playback === "ended" ? "↻ Replay" : "▶ Play" }}
      </button>
      <button
        v-if="playback === 'playing'"
        @click="handlePause"
        class="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs font-bold"
      >
        ⏸ Pause
      </button>
      <button
        v-if="playback === 'paused'"
        @click="handleResume"
        class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold"
      >
        ▶ Resume
      </button>
      <button
        v-if="playback === 'playing' || playback === 'paused' || playback === 'ended'"
        @click="handleReset"
        class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold"
      >
        ⟲ Reset
      </button>
    </div>

    <div ref="containerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { flattenRowMajor, matchObjectNames } from "../lib/animation";

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

export type PlaybackState = "stopped" | "playing" | "paused" | "ended";

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

const props = defineProps<{
  models: ViewerModel[];
  animations: PartAnimation[];
}>();

const emit = defineEmits<{
  (e: "playback-change", s: PlaybackState): void;
  (e: "mesh-bound", info: MeshBindInfo): void;
  (e: "mesh-missing", info: MeshMissingInfo): void;
}>();

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

// ---- three.js imperative core ----
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let rafId: number | null = null;
let lastTick = 0;
let clockTime = 0;
let loadToken = 0;
const groups = new Map<number, THREE.Group>();
/** Pose targets per model: whole group, or only the matched `o` sub-meshes. */
const targets = new Map<number, THREE.Object3D[]>();
/** Bind reports already emitted (per model + object) to avoid log spam. */
const reportedBinds = new Set<string>();
const fittedObjects: THREE.Object3D[] = [];
let placeholder: THREE.Mesh | null = null;
let resizeObserver: ResizeObserver | null = null;
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

function applyPose(modelIndex: number, t: number, dur: number) {
  const list = targets.get(modelIndex);
  const poses = posesByModel.value.get(modelIndex);
  if (!list || list.length === 0 || !poses || poses.length === 0) return;
  sampleTrack(poses, t, dur, tmpPos, tmpQuat);
  // NOTE: no display scale or centering here — planner coordinates apply 1:1.
  for (const o of list) {
    o.position.copy(tmpPos);
    o.quaternion.copy(tmpQuat);
  }
}

function applyFirstFrames() {
  const dur = stepDuration.value;
  for (const idx of targets.keys()) applyPose(idx, 0, dur);
}

/** Collect mesh descendants carrying an OBJ object name. */
function namedMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name) out.push(child as THREE.Mesh);
  });
  return out;
}

/**
 * Resolve which scene objects each animation entry drives, verifying the
 * sub-mesh actually exists. Whole-file parts drive their group; shared-file
 * parts drive only the matching `o` children, in place (same parent chain,
 * so planner world transforms still apply 1:1). Emits one bind/missing
 * report per model+object; missing parts keep their assembled pose.
 */
function rebindTargets() {
  targets.clear();
  const byAnim = new Map<number, { partId: string; objectName: string | null; fileName: string }>();
  for (const a of props.animations) {
    if (a.frames.length > 0) byAnim.set(a.modelIndex, { partId: a.partId, objectName: a.objectName, fileName: a.fileName });
  }
  for (const [idx, info] of byAnim) {
    const group = groups.get(idx);
    if (!group) continue; // model failed to load; pose application skips it
    if (info.objectName === null) {
      targets.set(idx, [group]);
      continue;
    }
    const meshes = namedMeshes(group);
    const matched = meshes.filter((m) => matchObjectNames([m.name], info.objectName as string).length > 0);
    const key = `${idx}:${info.objectName}`;
    if (matched.length > 0) {
      targets.set(idx, matched);
      if (!reportedBinds.has(key)) {
        reportedBinds.add(key);
        emit("mesh-bound", {
          partId: info.partId,
          modelIndex: idx,
          meshCount: matched.length,
          objectName: info.objectName,
          fileName: info.fileName,
        });
      }
    } else {
      targets.set(idx, []);
      if (!reportedBinds.has(key)) {
        reportedBinds.add(key);
        const childrenFound = [...new Set(meshes.map((m) => m.name))].slice(0, 12);
        console.error(`Sub-mesh "${info.objectName}" not found in ${info.fileName}; part stays static.`);
        emit("mesh-missing", {
          partId: info.partId,
          modelIndex: idx,
          objectName: info.objectName,
          fileName: info.fileName,
          childrenFound,
        });
      }
    }
  }
}

/** Frame the camera on the true (unscaled, uncentered) model bounds. */
function fitCamera() {
  if (!scene || !camera || !controls || fittedObjects.length === 0) return;
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

function clearModels() {
  if (!scene) return;
  for (const [, g] of groups) {
    scene.remove(g);
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
  targets.clear();
  fittedObjects.length = 0;
  updatePlaceholder();
}

function updatePlaceholder() {
  if (!scene) return;
  const needPlaceholder = groups.size === 0;
  if (needPlaceholder && !placeholder) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: "#3b82f6", wireframe: true });
    placeholder = new THREE.Mesh(geo, mat);
    placeholder.position.set(0, 0.5, 0);
    scene.add(placeholder);
  } else if (!needPlaceholder && placeholder) {
    scene.remove(placeholder);
    placeholder.geometry.dispose();
    (placeholder.material as THREE.Material).dispose();
    placeholder = null;
  }
}

async function loadModels() {
  if (!scene) return;
  const token = ++loadToken;
  clearModels();
  reportedBinds.clear();
  const loader = new OBJLoader();
  await Promise.all(
    props.models.map(async (m, idx) => {
      try {
        const obj = await loader.loadAsync(m.url);
        if (token !== loadToken) return; // superseded by a newer upload
        const clone = obj.clone(true);
        const group = new THREE.Group();
        if (m.objectName) {
          // Shared-file part: the group holds ONLY its own sub-meshes, so a
          // sibling part's track can never move (or ghost-duplicate) them.
          const matched = namedMeshes(clone).filter(
            (mesh) => matchObjectNames([mesh.name], m.objectName as string).length > 0
          );
          if (matched.length > 0) matched.forEach((mesh) => group.add(mesh));
          else group.add(clone); // sub-mesh not found: keep whole file visible, pose stays static
        } else {
          group.add(clone);
        }
        scene!.add(group);
        groups.set(idx, group);
        fittedObjects.push(group);
        rebindTargets();
        // Show the assembled (first-frame) pose immediately, matching R3F behaviour.
        applyPose(idx, 0, stepDuration.value);
        if (token === loadToken) {
          updatePlaceholder();
          fitCamera();
        }
      } catch (err) {
        console.error(`Failed to load OBJ ${m.name}:`, err);
      }
    })
  );
}

function tick(now: number) {
  rafId = requestAnimationFrame(tick);
  const dt = lastTick === 0 ? 0 : (now - lastTick) / 1000;
  lastTick = now;
  if (playback.value === "playing") {
    clockTime += dt;
    if (clockTime >= duration.value) {
      clockTime = duration.value; // hold the final assembled pose
      setState("ended");
    } else {
      const dur = stepDuration.value;
      for (const [idx] of targets) {
        const offset = (orderOf.value.get(idx) ?? 0) * dur;
        // Sequential semantics: this part moves during [timeOffset, timeOffset+stepDuration].
        const local = Math.min(Math.max(clockTime - offset, 0), dur);
        applyPose(idx, local, dur);
      }
    }
  }
  controls?.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function initThree() {
  const container = containerRef.value;
  if (!container) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#111827");

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 10000);
  camera.position.set(30, 30, 30);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(10, 10, 5);
  scene.add(dir);

  // Equivalent of drei <Environment preset="city">: neutral IBL, no external HDR download needed.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const grid = new THREE.GridHelper(40, 40, 0x4b5563, 0x374151);
  scene.add(grid);

  updatePlaceholder();

  resizeObserver = new ResizeObserver(() => {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  lastTick = 0;
  rafId = requestAnimationFrame(tick);
  void loadModels();
}

function disposeThree() {
  loadToken++;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearModels();
  controls?.dispose();
  controls = null;
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
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
    // New animation data arrives: re-verify sub-mesh binds, then stop and
    // reset to the assembled pose.
    rebindTargets();
    clockTime = 0;
    setState("stopped");
    applyFirstFrames();
  },
  { deep: true }
);

onMounted(() => {
  initThree();
});

onBeforeUnmount(() => {
  disposeThree();
});

function handlePlay() {
  if (props.animations.length === 0 || duration.value <= 0) return;
  clockTime = 0; // (re)play from the first frame; OBJs stay loaded
  applyFirstFrames();
  lastTick = 0;
  setState("playing");
}

function handlePause() {
  setState("paused");
}

function handleResume() {
  lastTick = 0;
  setState("playing");
}

function handleReset() {
  clockTime = 0;
  applyFirstFrames();
  setState("stopped");
}
</script>
