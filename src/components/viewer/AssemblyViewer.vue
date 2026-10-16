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

    <!-- Playback controls -->
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2 app-card p-2">
      <button
        v-if="playback !== 'playing'"
        class="btn btn-primary btn-sm"
        :disabled="animations.length === 0"
        @click="play"
      >
        <span class="material-icons text-[15px]">play_arrow</span>
        {{ playback === "paused" ? "Resume" : "Play" }}
      </button>
      <button
        v-else
        class="btn btn-outline btn-sm"
        @click="pause"
      >
        <span class="material-icons text-[15px]">pause</span>
        Pause
      </button>
      <button
        class="btn btn-outline btn-sm"
        :disabled="animations.length === 0 || playback === 'stopped'"
        @click="resetPlayback"
      >
        <span class="material-icons text-[15px]">replay</span>
        Reset
      </button>
      <span v-if="animations.length === 0" class="text-[11px] text-black/45">
        Run a plan to enable playback.
      </span>
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
import type { MeshBindInfo, MeshMissingInfo, PartAnimation, PlaybackState, ViewerModel } from "../../lib/types";

const props = defineProps<{
  models: ViewerModel[];
  animations: PartAnimation[];
  selectedPartId?: string;
  onMeshBound?: (info: MeshBindInfo) => void;
  onMeshMissing?: (info: MeshMissingInfo) => void;
  allowMeshSelection?: boolean;
  selectionResetKey?: number;
}>();

const emit = defineEmits<{
  (e: "playback-change", s: PlaybackState): void;
  (e: "mesh-selected", objectName: string, partId: string, screenX: number, screenY: number): void;
}>();

const FRAMES_PER_SECOND = 30;
/** Tiny lift so the model's bottom face isn't exactly coplanar with the grid lines (display-only). */
const FLOOR_EPSILON = 1e-3;

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

function play() {
  if (props.animations.length === 0) return;
  // Restart from the beginning when replaying after the end.
  if (playback.value === "ended") clockTime = 0;
  setState("playing");
}

function pause() {
  if (playback.value === "playing") setState("paused");
}

function resetPlayback() {
  clockTime = 0;
  setState("stopped");
  // Snap every part back to its first-frame (assembled) pose.
  const dur = stepDuration.value;
  for (const [idx] of groups) applyPose(idx, 0, dur);
}

// ---- three.js core lives in the ported client viewer singleton (src/libs/3d/viewer.ts) ----
let loadToken = 0;
let clockTime = 0;
const groups = new Map<number, THREE.Group>();
const fittedObjects: THREE.Object3D[] = [];
// Every model group hangs off one root so the y=0 floor alignment is a single rigid translate
// (display-only: never sent to the API, never baked into geometry).
let assemblyRoot: THREE.Group | null = null;
let resizeObserver: ResizeObserver | null = null;
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// Raycasting for mesh selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const highlightedMesh = ref<THREE.Mesh | null>(null);
const highlightedObjectName = ref("");
const highlightedPartId = ref("");
const originalMaterial = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
let selectionPointerStart: { x: number; y: number } | null = null;

function applyPose(modelIndex: number, t: number, dur: number) {
  const g = groups.get(modelIndex);
  const poses = posesByModel.value.get(modelIndex);
  if (!g || !poses || poses.length === 0) return;
  sampleTrack(poses, t, dur, tmpPos, tmpQuat);
  // NOTE: no display scale or centering here — planner coordinates apply 1:1.
  // The y=0 floor lift lives on assemblyRoot (see alignToFloor), not on this group.
  g.position.copy(tmpPos);
  g.quaternion.copy(tmpQuat);
}

/**
 * Lift the whole assembly so its lowest geometry rests on the y=0 grid.
 * Single rigid translate on assemblyRoot computed from the combined Box3 of all
 * loaded parts (all child meshes included via expandByObject). Display-only:
 * no geometry/scale change, planner poses stay 1:1 inside the root, and the
 * grid itself is never moved or exported.
 */
function alignToFloor() {
  if (!assemblyRoot || fittedObjects.length === 0) return;
  // Idempotent: measure from the un-lifted frame so repeated calls don't stack.
  assemblyRoot.position.y = 0;
  assemblyRoot.updateMatrixWorld(true);
  const box = new THREE.Box3();
  fittedObjects.forEach((o) => box.expandByObject(o));
  if (box.isEmpty()) return;
  assemblyRoot.position.y = -box.min.y + FLOOR_EPSILON;
  assemblyRoot.updateMatrixWorld(true);
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
  clearHighlight();
  for (const [, g] of groups) {
    assemblyRoot?.remove(g);
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
  originalMaterial.clear();
  fittedObjects.length = 0;
  if (assemblyRoot) assemblyRoot.position.y = 0;
}

async function loadModels() {
  if (!viewer.scene) return;
  const token = ++loadToken;
  clearHighlight();
  clearModels();
  if (!assemblyRoot) {
    assemblyRoot = new THREE.Group();
    assemblyRoot.name = "AssemblyRoot";
    viewer.scene.add(assemblyRoot);
  }
  const loader = new OBJLoader();
  await Promise.all(
    props.models.map(async (m, idx) => {
      try {
        const obj = await loader.loadAsync(m.url);
        if (token !== loadToken) return; // superseded by a newer upload
        const group = new THREE.Group();
        let target: THREE.Object3D | null = null;
        if (m.objectName) {
          // Bind the specific sub-mesh (`o` name) instead of the whole model.
          target = obj.getObjectByName(m.objectName) ?? null;
          if (target) {
            group.add(target.clone());
            const meshCount = (target as THREE.Mesh).isMesh ? 1 : (target.children?.filter((c) => (c as THREE.Mesh).isMesh).length ?? 0);
            props.onMeshBound?.({
              partId: m.name,
              modelIndex: idx,
              meshCount,
              objectName: m.objectName,
              fileName: m.name,
            });
          } else {
            const childNames = obj.children.map((c) => c.name).filter(Boolean);
            props.onMeshMissing?.({
              partId: m.name,
              modelIndex: idx,
              objectName: m.objectName,
              fileName: m.name,
              childrenFound: childNames,
            });
            // Fall back to the whole model so the part stays visible (static).
            group.add(obj.clone());
          }
        } else {
          // No sub-mesh: move the whole model.
          group.add(obj.clone());
        }
        assemblyRoot!.add(group);
        groups.set(idx, group);
        fittedObjects.push(group);
        // Show the assembled (first-frame) pose immediately, matching R3F behaviour.
        applyPose(idx, 0, stepDuration.value);
      } catch (err) {
        console.error(`Failed to load part ${m.name}:`, err);
      }
    })
  );
  if (token !== loadToken) return;
  // Rest the assembled model on the y=0 grid, then frame the camera/grid on the lifted bounds.
  alignToFloor();
  fitGrid();
  fitCamera();
  if (props.selectedPartId) highlightPart(props.selectedPartId);
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

  // Add click handler for mesh selection
  container.addEventListener("pointerdown", onSelectionPointerDown);
  container.addEventListener("click", onCanvasClick);

  viewer.startLoop(tick);
  void loadModels();
}

function onSelectionPointerDown(event: PointerEvent) {
  selectionPointerStart = { x: event.clientX, y: event.clientY };
}

function onCanvasClick(event: MouseEvent) {
  if (!props.allowMeshSelection) return;
  if (selectionPointerStart) {
    const moved = Math.hypot(event.clientX - selectionPointerStart.x, event.clientY - selectionPointerStart.y);
    selectionPointerStart = null;
    if (moved > 5) return;
  }

  const container = containerRef.value;
  if (!container || !viewer.camera) return;

  const rect = container.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, viewer.camera);

  const meshes: THREE.Mesh[] = [];
  groups.forEach((group) => {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });
  });

  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object as THREE.Mesh;
    const hitModel = [...groups.entries()].find(([, group]) => {
      let ancestor: THREE.Object3D | null = clickedMesh;
      while (ancestor && ancestor !== group) ancestor = ancestor.parent;
      return ancestor === group;
    });
    const model = hitModel ? props.models[hitModel[0]] : null;
    if (!model) return;

    if (highlightedPartId.value === model.partId) {
      clearHighlight();
      emit("mesh-selected", "", "", event.clientX, event.clientY);
      return;
    }

    highlightMesh(clickedMesh);
    highlightedObjectName.value = model.objectName || model.name;
    highlightedPartId.value = model.partId;
    emit("mesh-selected", highlightedObjectName.value, model.partId, event.clientX, event.clientY);
  } else {
    clearHighlight();
    emit("mesh-selected", "", "", event.clientX, event.clientY);
  }
}

function highlightMesh(mesh: THREE.Mesh) {
  // Clear previous highlight
  clearHighlight();

  // Store original material
  if (!originalMaterial.has(mesh)) {
    originalMaterial.set(mesh, mesh.material);
  }

  // Apply highlight material
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  mesh.material = highlightMat;
  highlightedMesh.value = mesh;
}

function clearHighlight() {
  highlightedObjectName.value = "";
  highlightedPartId.value = "";
  for (const [mesh, original] of originalMaterial) {
    const current = mesh.material;
    if (current !== original) {
      if (Array.isArray(current)) current.forEach((material) => material.dispose());
      else current.dispose();
    }
    mesh.material = original;
  }
  highlightedMesh.value = null;
}

function highlightPart(partId: string) {
  if (!partId) {
    clearHighlight();
    return;
  }
  const modelIndex = props.models.findIndex((model) => model.partId === partId);
  const group = groups.get(modelIndex);
  if (!group) return;
  let mesh: THREE.Mesh | null = null;
  group.traverse((child) => {
    if (!mesh && (child as THREE.Mesh).isMesh) mesh = child as THREE.Mesh;
  });
  if (mesh) {
    highlightMesh(mesh);
    highlightedObjectName.value = props.models[modelIndex].objectName || props.models[modelIndex].name;
    highlightedPartId.value = partId;
  }
}

function disposeViewer() {
  loadToken++;
  resizeObserver?.disconnect();
  resizeObserver = null;
  const container = containerRef.value;
  if (container) {
    container.removeEventListener("pointerdown", onSelectionPointerDown);
    container.removeEventListener("click", onCanvasClick);
  }
  clearModels();
  clearHighlight();
  viewer.dispose();
}

watch(
  () => props.models.map((m) => m.url).join("|"),
  () => {
    void loadModels();
  }
);

watch(
  () => props.allowMeshSelection,
  (allowed) => {
    if (!allowed) clearHighlight();
  }
);

watch(
  () => props.selectionResetKey,
  () => {
    clearHighlight();
    highlightedObjectName.value = "";
  }
);

watch(
  () => props.selectedPartId,
  (partId) => highlightPart(partId || "")
);

watch(
  () => props.animations,
  () => {
    clockTime = 0;
    setState("stopped");
  },
  { deep: true }
);

onMounted(() => {
  initViewer();
});

onBeforeUnmount(() => {
  disposeViewer();
});

</script>
