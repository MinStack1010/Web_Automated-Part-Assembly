
<script setup lang="ts">
import { watch } from "vue";
import type { AssemblyPayloadConfig } from "../../composables/useAssemblyJob";

const props = defineProps<{
  isPolling: boolean;
  pollAttempt: number;
  uploadId: string | null;
  jobId: string | null;
  jobOperation: string;
  jointPlanMode: boolean;
  partOptions: { id: string; label: string }[];
  movePartId: string;
  selectedMeshName: string;
  payloadConfig: AssemblyPayloadConfig;
  showAdvancedConfig: boolean;
}>();

// Keep planner settings valid for the selected engine.
// Also correct invalid values when the component is mounted or when
// the parent restores/changes an existing configuration.
watch(
  () => [
    props.payloadConfig.engine,
    props.payloadConfig.sequence_planner,
    props.payloadConfig.path_planner,
  ] as const,
  ([engine, sequencePlanner, pathPlanner]) => {
    const validSequencePlanners: readonly string[] =
      engine === "physics"
        ? ["random", "queue", "prog-queue"]
        : ["random", "queue"];

    const validPathPlanners: readonly string[] =
      engine === "physics"
        ? ["bfs", "bk-rrt"]
        : ["rrt", "rrt-connect", "birrt", "trrt", "matevec-trrt"];

    if (!validSequencePlanners.includes(sequencePlanner)) {
      props.payloadConfig.sequence_planner = "queue";
    }

    if (!validPathPlanners.includes(pathPlanner)) {
      props.payloadConfig.path_planner =
        engine === "physics" ? "bfs" : "rrt";
    }
  },
  { immediate: true },
);

const emit = defineEmits<{
  (e: "start-job", endpoint: "joint-plan" | "multi-plan"): void;
  (e: "joint-plan-mode"): void;
  (e: "update:movePartId", value: string): void;
  (e: "reset-selection"): void;
  (e: "toggle-advanced-config"): void;
  (e: "cancel-current-job"): void;
}>();
</script>

<template>
  <section class="app-card shrink-0 p-4 space-y-3">
    <div class="flex gap-2">
      <button
        @click="emit('joint-plan-mode')"
        :disabled="props.isPolling || !props.uploadId"
        class="btn btn-primary flex-1"
      >
        {{
          props.jointPlanMode
            ? "Selecting meshes…"
            : props.isPolling && props.jobOperation === "joint-plan"
              ? `Planning… ${props.pollAttempt}`
              : "Joint Plan"
        }}
      </button>

      <button
        @click="emit('start-job', 'multi-plan')"
        :disabled="props.isPolling || !props.uploadId"
        class="btn btn-primary flex-1"
      >
        {{
          props.isPolling && props.jobOperation === "multi-plan"
            ? `Planning… ${props.pollAttempt}`
            : "Multi Plan"
        }}
      </button>
    </div>

    <button
      v-if="props.jointPlanMode"
      @click="emit('start-job', 'joint-plan')"
      :disabled="props.isPolling || !props.uploadId || !props.movePartId"
      class="btn btn-primary w-full"
    >
      {{ props.isPolling ? `Planning… ${props.pollAttempt}` : "Run Joint Plan" }}
    </button>

    <label
      v-if="props.jointPlanMode && props.partOptions.length"
      class="block space-y-1"
    >
      <span class="flex items-center justify-between">
        <span class="text-[11px] font-semibold text-black/55">
          Part to move
        </span>

        <button
          type="button"
          :disabled="!props.movePartId"
          @click="emit('reset-selection')"
          class="text-[10px] text-black/50 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </span>

      <select
        :value="props.movePartId"
        @change="
          emit(
            'update:movePartId',
            ($event.target as HTMLSelectElement).value,
          )
        "
        class="w-full text-[12px] bg-white border border-black/10 rounded px-2 py-1.5 text-carbon focus:outline-none focus:border-primary"
      >
        <option value="" disabled>Choose a part to move</option>

        <option
          v-for="part in props.partOptions"
          :key="part.id"
          :value="part.id"
        >
          {{ part.label }}
        </option>
      </select>

      <span
        v-if="props.selectedMeshName"
        class="block text-[10px] text-primary"
      >
        Selected mesh: {{ props.selectedMeshName }}
      </span>

      <span
        v-if="props.movePartId"
        class="block text-[10px] text-black/40"
      >
        Moving:
        {{
          props.partOptions.find(
            (part) => part.id === props.movePartId,
          )?.label || props.movePartId
        }}
      </span>

      <span v-else class="block text-[10px] text-black/40">
        Select a mesh or choose a part above.
      </span>
    </label>

    <p
      v-if="props.jointPlanMode"
      class="text-[11px] text-primary mt-2"
    >
      <span class="material-icons text-[12px] align-middle">info</span>
      Click a model part or choose it here. Only one part can be selected
      at a time.
    </p>

    <div
      v-if="props.uploadId"
      class="border-t border-black/10 pt-3"
    >
      <button
        type="button"
        @click="emit('toggle-advanced-config')"
        class="flex items-center gap-1.5 text-[12px] font-medium text-black/70 hover:text-primary transition-colors w-full justify-between focus:outline-none"
      >
        <span class="flex items-center gap-1.5">
          <span class="material-icons text-[16px]">tune</span>
          Advanced Features
        </span>

        <span class="material-icons text-[16px]">
          {{ props.showAdvancedConfig ? "expand_less" : "expand_more" }}
        </span>
      </button>

      <div
        v-if="props.showAdvancedConfig"
        class="mt-3 space-y-3 bg-black/[0.02] p-3 rounded-md border border-black/5"
      >
        <div
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-[11px]"
        >
          <!-- Engine -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Engine</label>

            <select
              v-model="props.payloadConfig.engine"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            >
              <option value="physics">physics</option>
              <option value="geometric">geometric</option>
            </select>
          </div>

          <!-- Sequence Planner -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Sequence Planner
            </label>

            <select
              v-model="props.payloadConfig.sequence_planner"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            >
              <option value="random">random</option>
              <option value="queue">queue</option>

              <option
                v-if="props.payloadConfig.engine === 'physics'"
                value="prog-queue"
              >
                prog-queue
              </option>
            </select>
          </div>

          <!-- Path Planner -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Path Planner
            </label>

            <select
              v-model="props.payloadConfig.path_planner"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            >
              <template
                v-if="props.payloadConfig.engine === 'physics'"
              >
                <option value="bfs">bfs</option>
                <option value="bk-rrt">bk-rrt</option>
              </template>

              <template v-else>
                <option value="rrt">rrt</option>
                <option value="rrt-connect">rrt-connect</option>
                <option value="birrt">birrt</option>
                <option value="trrt">trrt</option>
                <option value="matevec-trrt">matevec-trrt</option>
              </template>
            </select>
          </div>

          <!-- Body Type -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Body Type</label>

            <select
              v-model="props.payloadConfig.body_type"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            >
              <option value="bvh">bvh</option>
              <option value="sdf">sdf</option>
            </select>
          </div>

          <!-- SDF DX -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">SDF DX</label>

            <input
              type="number"
              step="0.01"
              v-model.number="props.payloadConfig.sdf_dx"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Sequence Max Time -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Sequence Max Time (s)
            </label>

            <input
              type="number"
              v-model.number="props.payloadConfig.sequence_max_time"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Path Max Time -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Path Max Time (s)
            </label>

            <input
              type="number"
              v-model.number="props.payloadConfig.path_max_time"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Seed -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Seed</label>

            <input
              type="number"
              v-model.number="props.payloadConfig.seed"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- N Save States -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">N Save States</label>

            <input
              type="number"
              v-model.number="props.payloadConfig.n_save_states"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Collision Threshold -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Collision Threshold
            </label>

            <input
              type="number"
              step="0.001"
              v-model.number="props.payloadConfig.collision_threshold"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Force Magnitude -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">
              Force Magnitude
            </label>

            <input
              type="number"
              v-model.number="props.payloadConfig.force_magnitude"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Frame Skip -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Frame Skip</label>

            <input
              type="number"
              v-model.number="props.payloadConfig.frame_skip"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Max Collision -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Max Collision</label>

            <input
              type="number"
              step="0.001"
              v-model.number="props.payloadConfig.max_collision"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>

          <!-- Step Size -->
          <div class="flex flex-col gap-1">
            <label class="font-medium text-black/60">Step Size</label>

            <input
              type="number"
              step="0.001"
              v-model.number="props.payloadConfig.step_size"
              class="border border-black/15 rounded px-2 py-1 bg-white text-carbon focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <!-- Boolean options -->
        <div
          class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-black/10 text-[11px]"
        >
          <label
            class="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              v-model="props.payloadConfig.rotation"
              class="rounded text-primary focus:ring-0"
            />
            <span class="text-black/70 font-medium">Rotation</span>
          </label>

          <label
            class="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              v-model="props.payloadConfig.save_artifacts"
              class="rounded text-primary focus:ring-0"
            />
            <span class="text-black/70 font-medium">Save Artifacts</span>
          </label>

          <label
            class="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              v-model="props.payloadConfig.adaptive_collision"
              class="rounded text-primary focus:ring-0"
            />
            <span class="text-black/70 font-medium">Adaptive Collision</span>
          </label>

          <label
            class="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              v-model="props.payloadConfig.simplify"
              class="rounded text-primary focus:ring-0"
            />
            <span class="text-black/70 font-medium">Simplify</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Current task -->
    <div
      v-if="props.jobId"
      class="border-t border-black/10 pt-2 flex items-center justify-between gap-2"
    >
      <span class="text-[11px] text-black/45 mono truncate">
        Task:
        <span class="text-primary font-semibold">{{ props.jobId }}</span>
        <span> ({{ props.jobOperation || "?" }})</span>
      </span>

      <button
        type="button"
        @click="emit('cancel-current-job')"
        class="btn btn-danger btn-sm text-[10px] shrink-0 px-2 py-1"
      >
        Cancel Current Job
      </button>
    </div>
  </section>
</template>
