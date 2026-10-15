"use client";

import { Canvas, useLoader, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import { Suspense, useMemo, useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OBJLoader } from "three-stdlib";
import { flattenRowMajor } from "@/lib/animation";

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

export type PlaybackState = "stopped" | "playing" | "paused" | "ended";

const FRAMES_PER_SECOND = 30;

interface DecodedPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** Decompose a row-major 4x4 planner matrix into position + rotation (scale is ignored: planner outputs rigid transforms). */
function decodeMatrix(matrix: number[][]): DecodedPose {
  const m = new THREE.Matrix4();
  m.set(...(flattenRowMajor(matrix) as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat };
}

/** Sample the frame track at time t (seconds) with lerp/slerp between keyframes. */
function sampleTrack(poses: DecodedPose[], t: number, duration: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
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

function ModelNode({
  url,
  frames,
  playing,
  clock,
  stepDuration,
  timeOffset,
  onLoad,
}: {
  url: string;
  frames: AnimationFrame[] | null;
  playing: boolean;
  clock: { current: number };
  stepDuration: number;
  timeOffset: number;
  onLoad: (obj: THREE.Object3D) => void;
}) {
  const obj = useLoader(OBJLoader, url);
  const copiedScene = useMemo(() => obj.clone(), [obj]);
  const groupRef = useRef<THREE.Group>(null);
  const posesRef = useRef<DecodedPose[] | null>(null);

  useEffect(() => {
    onLoad(copiedScene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiedScene]);

  // Decode once per path (translation AND rotation preserved).
  useEffect(() => {
    posesRef.current = frames && frames.length > 0 ? frames.map((f) => decodeMatrix(f.matrix)) : null;
    if ((!frames || frames.length === 0) && groupRef.current) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.quaternion.identity();
    }
  }, [frames]);

  useFrame(() => {
    const group = groupRef.current;
    const poses = posesRef.current;
    if (!group || !poses) return;
    // While stopped at t=0 show the assembled (first-frame) pose; while
    // paused/ended keep the last applied pose untouched.
    if (!playing && clock.current !== 0) return;
    // Sequential semantics: this part moves during [timeOffset, timeOffset+stepDuration].
    const local = playing ? Math.min(Math.max(clock.current - timeOffset, 0), stepDuration) : 0;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    sampleTrack(poses, local, stepDuration, p, q);
    // NOTE: no display scale or centering here — planner coordinates apply 1:1.
    group.position.copy(p);
    group.quaternion.copy(q);
  });

  return (
    <group ref={groupRef}>
      <primitive object={copiedScene} />
    </group>
  );
}

/** Frame the camera on the true (unscaled, uncentered) model bounds. */
function SceneFitter({ objects }: { objects: THREE.Object3D[] }) {
  const { camera, controls } = useThree((s) => ({ camera: s.camera, controls: s.controls }));
  useEffect(() => {
    if (objects.length === 0) return;
    const box = new THREE.Box3();
    objects.forEach((o) => box.expandByObject(o));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = camera.position.clone().sub(center);
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize();
    camera.position.copy(center).addScaledVector(dir, Math.max(size * 1.4, 1));
    camera.lookAt(center);
    const ctl = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (ctl && ctl.target) {
      ctl.target.copy(center);
      ctl.update?.();
    }
  }, [objects, camera, controls]);
  return null;
}

function SceneContent({
  models,
  animations,
  playing,
  clock,
  stepDuration,
}: {
  models: ViewerModel[];
  animations: PartAnimation[];
  playing: boolean;
  clock: { current: number };
  stepDuration: number;
}) {
  const byModel = useMemo(() => {
    const map = new Map<number, AnimationFrame[]>();
    animations.forEach((a) => map.set(a.modelIndex, a.frames));
    return map;
  }, [animations]);

  // Collect the cloned scene objects as they load, then fit the camera once.
  // Keyed by model set so stale objects from a previous upload never linger.
  const modelsKey = models.map((m) => m.url).join("|");
  const [fittedByKey, setFittedByKey] = useState<Record<string, THREE.Object3D[]>>({});
  const fitted = fittedByKey[modelsKey] ?? [];
  const handleLoad = useCallback(
    (obj: THREE.Object3D) => {
      setFittedByKey((prev) => {
        const list = prev[modelsKey] ?? [];
        if (list.includes(obj)) return prev;
        return { ...prev, [modelsKey]: [...list, obj] };
      });
    },
    [modelsKey]
  );

  // Step order follows the manifest (multi-plan sequence_index): part k moves during [k*stepDuration, (k+1)*stepDuration].
  const orderOf = useMemo(() => {
    const map = new Map<number, number>();
    animations.forEach((a, order) => map.set(a.modelIndex, order));
    return map;
  }, [animations]);

  return (
    <>
      <SceneFitter objects={fitted} />
      {models.length > 0 ? (
        models.map((m, idx) => (
          <ModelNode key={`${m.url}-${idx}`} url={m.url} frames={byModel.get(idx) ?? null} playing={playing} clock={clock} stepDuration={stepDuration} timeOffset={(orderOf.get(idx) ?? 0) * stepDuration} onLoad={handleLoad} />
        ))
      ) : (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#3b82f6" wireframe />
        </mesh>
      )}
    </>
  );
}

interface ThreeSceneProps {
  models: ViewerModel[];
  animations: PartAnimation[];
  onPlaybackChange?: (s: PlaybackState) => void;
}

export default function ThreeScene({ models, animations, onPlaybackChange }: ThreeSceneProps) {
  const [playback, setPlayback] = useState<PlaybackState>("stopped");
  const clockRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // One step slot per animation (joint-plan: a single slot). Steps play back
  // in manifest order; total time is the sum of the step slots.
  const stepDuration = useMemo(() => {
    const maxFrames = animations.reduce((m, a) => Math.max(m, a.frames.length), 0);
    if (maxFrames === 0) return 0;
    return Math.max(3, maxFrames / FRAMES_PER_SECOND);
  }, [animations]);
  const duration = stepDuration * Math.max(animations.length, 1);

  const setState = useCallback(
    (s: PlaybackState) => {
      setPlayback(s);
      onPlaybackChange?.(s);
    },
    [onPlaybackChange]
  );

  // New animation data arrives: stop and reset to the assembled pose.
  // This synchronizes the three.js clock (external system) with the new data,
  // which is exactly what effects are for.
  useEffect(() => {
    clockRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("stopped");
  }, [animations, setState]);

  // Single shared clock; the loop only advances while playing.
  useEffect(() => {
    if (playback !== "playing") return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      clockRef.current += dt;
      if (clockRef.current >= duration) {
        clockRef.current = duration; // hold the final assembled pose
        setState("ended");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playback, duration, setState]);

  const handlePlay = useCallback(() => {
    if (animations.length === 0 || duration <= 0) return;
    clockRef.current = 0; // (re)play from the first frame; OBJs stay loaded
    setState("playing");
  }, [animations, duration, setState]);

  const handlePause = useCallback(() => setState("paused"), [setState]);
  const handleResume = useCallback(() => setState("playing"), [setState]);
  const handleReset = useCallback(() => {
    clockRef.current = 0;
    setState("stopped");
  }, [setState]);

  const totalFrames = animations.reduce((m, a) => Math.max(m, a.frames.length), 0);

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700 relative">
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 max-w-[70%]">
        {playback === "playing" && (
          <div className="bg-black/60 px-3 py-1 rounded text-green-400 font-mono text-xs border border-green-500/30 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            PLAYING ANIMATION ({totalFrames} frames, {animations.length} part{animations.length > 1 ? "s" : ""})
          </div>
        )}
        {playback === "paused" && (
          <div className="bg-black/60 px-3 py-1 rounded text-amber-300 font-mono text-xs border border-amber-500/30">
            PAUSED — pose held
          </div>
        )}
        {playback === "ended" && (
          <div className="bg-black/60 px-3 py-1 rounded text-blue-300 font-mono text-xs border border-blue-500/30">
            ENDED — final assembled pose held
          </div>
        )}
        {animations.map((a) => (
          <div key={a.partId} className="bg-black/60 px-3 py-1 rounded text-gray-300 font-mono text-[11px] border border-gray-600/30">
            {a.partId} → {a.fileName} ({a.frames.length} frames)
          </div>
        ))}
      </div>

      {animations.length > 0 && (
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          {(playback === "stopped" || playback === "ended") && (
            <button onClick={handlePlay} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold">
              {playback === "ended" ? "↻ Replay" : "▶ Play"}
            </button>
          )}
          {playback === "playing" && (
            <button onClick={handlePause} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs font-bold">
              ⏸ Pause
            </button>
          )}
          {playback === "paused" && (
            <button onClick={handleResume} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold">
              ▶ Resume
            </button>
          )}
          {(playback === "playing" || playback === "paused" || playback === "ended") && (
            <button onClick={handleReset} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold">
              ⟲ Reset
            </button>
          )}
        </div>
      )}

      <Canvas camera={{ position: [30, 30, 30], fov: 50 }}>
        <color attach="background" args={["#111827"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        <Suspense fallback={null}>
          <SceneContent models={models} animations={animations} playing={playback === "playing"} clock={clockRef} stepDuration={stepDuration} />
        </Suspense>

        <OrbitControls makeDefault />
        <Grid infiniteGrid fadeDistance={20} sectionColor="#4b5563" cellColor="#374151" />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
