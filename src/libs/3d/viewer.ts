import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Object3D,
  PerspectiveCamera,
  PointLight,
  REVISION,
  ReinhardToneMapping,
  Scene,
  SpotLight,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { markRaw } from "vue";

/**
 * Core viewer ported from `client/libs/3d/viewer.js` (Nuxt project).
 *
 * Kept: initRenderer / initDefaultScene (camera rig, light rig, grid, background),
 * the singleton `viewer` export and the "keep it outside Vue components" rule.
 * Dropped: snap mode, raycast/selection hooks and the synode environment/editor
 * dependencies that only exist in the Nuxt app.
 */

export const ViewerMode = {
  Cursor: "cursor",
  Snap: "snap",
} as const;
export type ViewerMode = (typeof ViewerMode)[keyof typeof ViewerMode];

type LoopFn = (dt: number, now: number) => void;

export class Viewer {
  scene: Scene | null = null;
  camera: PerspectiveCamera | null = null;
  renderer: WebGLRenderer | null = null;
  controls: OrbitControls | null = null;
  spotLight: SpotLight | null = null;
  cameraMain: Object3D | null = null;
  cameraTarget: Object3D | null = null;
  grid: GridHelper | null = null;
  mode: ViewerMode = ViewerMode.Cursor;

  mouse = new Vector2();
  prevMouse = new Vector2();
  mouseMovedThisFrame = false;

  private rafId: number | null = null;
  private lastTick = 0;
  private loopFn: LoopFn | null = null;

  constructor() {
    console.log("viewer.ts THREE REVISION " + REVISION);
  }

  initRenderer(width: number, height: number) {
    this.renderer = markRaw(new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.cssText = "height: 100% !important; width: 100% !important;";
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0xe7e6e2, 0.8);
  }

  /** Same default stage as the client: camera at (0,10,10), orbit controls, grid, 4 point lights + key lights. */
  initDefaultScene() {
    const resolution = new Vector2();
    this.renderer!.getSize(resolution);

    this.scene = markRaw(new Scene());

    this.camera = markRaw(
      new PerspectiveCamera(45, resolution.x / resolution.y, 0.01, 2000)
    );
    this.camera.position.set(0, 10, 10);
    this.camera.layers.set(0);
    this.scene.add(this.camera);

    this.controls = markRaw(new OrbitControls(this.camera, this.renderer!.domElement));
    this.controls.update();
    this.controls.enableRotate = true;

    this.cameraMain = new Object3D();
    this.cameraMain.name = "Camera_Main";
    this.cameraMain.position.set(0, 10, 10);
    this.cameraTarget = new Object3D();
    this.cameraTarget.name = "Camera_Main_Target";
    this.scene.add(this.cameraMain);
    this.scene.add(this.cameraTarget);

    this.setGrid(10, 25);

    const light1 = new PointLight(0xffffff, 0.8, 0);
    light1.position.set(10, -10, 10);
    this.scene.add(light1);

    const light2 = new PointLight(0xffffff, 0.8, 0);
    light2.position.set(-10, -10, 10);
    this.scene.add(light2);

    const light3 = new PointLight(0xffffff, 0.8, 0);
    light3.position.set(10, 10, -10);
    this.scene.add(light3);

    const light4 = new PointLight(0xffffff, 0.8, 0);
    light4.position.set(-10, 10, -10);
    this.scene.add(light4);

    const directionalLight = new DirectionalLight(0xffffff, 1);
    this.scene.add(directionalLight);

    const hemiLight = new HemisphereLight(0xffffff, 0xffffff, 0.75);
    this.scene.add(hemiLight);

    const ambiance = new AmbientLight(0xffffff, 0.75);
    this.scene.add(ambiance);

    const spotLight = new SpotLight(0xffffff, 0.75);
    spotLight.castShadow = true;
    spotLight.shadow.bias = -0.0001;
    spotLight.shadow.mapSize.width = 1024 * 4;
    spotLight.shadow.mapSize.height = 1024 * 4;
    this.scene.add(spotLight);
    this.spotLight = spotLight;

    this.scene.background = new Color(0xfafafa);
  }

  /** Build (or rebuild) the floor grid; sized to the loaded assembly by the viewer component. */
  setGrid(size: number, divisions = 25) {
    if (!this.scene) return;
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as { dispose?: () => void }).dispose?.();
      this.grid = null;
    }
    const gridHelper = new GridHelper(size, divisions);
    gridHelper.name = "GridHelper";
    this.scene.add(gridHelper);
    this.grid = gridHelper;
  }

  updateMouseCoords(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    const el = this.renderer?.domElement;
    const target = event.target as HTMLElement | null;
    if (!el || !target || typeof target.getBoundingClientRect !== "function") return;
    const rect = target.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.x) / target.clientWidth) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.y) / target.clientHeight) * 2 + 1;
  }

  onMouseMove(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    this.mouseMovedThisFrame = true;
    this.prevMouse = this.mouse.clone();
    this.updateMouseCoords(event);
  }

  startLoop(fn: LoopFn) {
    this.stopLoop();
    this.loopFn = fn;
    this.lastTick = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stopLoop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.loopFn = null;
    this.lastTick = 0;
  }

  private tick = (now: number) => {
    this.rafId = requestAnimationFrame(this.tick);
    const dt = this.lastTick === 0 ? 0 : (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.mouseMovedThisFrame = false;
    this.loopFn?.(dt, now);
    this.controls?.update();
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  };

  resize(width: number, height: number) {
    if (!width || !height || !this.renderer || !this.camera) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  getObjectByName(name: string) {
    return this.scene?.getObjectByName(name);
  }

  dispose() {
    this.stopLoop();
    this.controls?.dispose();
    this.controls = null;
    this.grid = null;
    this.cameraMain = null;
    this.cameraTarget = null;
    this.spotLight = null;
    this.scene = null;
    this.camera = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
  }
}

// NOTE(brandon): keep this outside any Vue component as a standalone variable to avoid vue reactivity.
export const viewer = new Viewer();
