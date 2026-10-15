<script setup lang="ts">
defineProps<{
  isPolling: boolean;
  pollAttempt: number;
  uploadId: string | null;
  jobId: string | null;
  jobOperation: string;
  jointPlanMode: boolean;
  partOptions: { id: string; label: string }[];
  movePartId: string;
  selectedMeshName: string;
}>();

const emit = defineEmits<{
  (e: "start-job", endpoint: "joint-plan" | "multi-plan"): void;
  (e: "joint-plan-mode"): void;
  (e: "update:movePartId", value: string): void;
  (e: "reset-selection"): void;
}>();
</script>

<template>
  <section class="app-card shrink-0 p-4 space-y-3">
    <div class="flex gap-2">
      <button
        @click="emit('joint-plan-mode')"
        :disabled="isPolling || !uploadId"
        title="Joint Plan: creates a movement path for the selected part so it can be assembled with the rest of the model."
        aria-label="Joint Plan: plan movement for the selected part"
        class="btn btn-primary flex-1"
      >
        {{ jointPlanMode ? "Selecting meshes…" : isPolling && jobOperation === "joint-plan" ? `Planning… ${pollAttempt}` : "Joint Plan" }}
      </button>
      <button
        @click="emit('start-job', 'multi-plan')"
        :disabled="isPolling || !uploadId"
        title="Multi Plan: automatically creates movement paths for multiple parts in assembly order."
        aria-label="Multi Plan: plan movement for multiple parts"
        class="btn btn-primary flex-1"
      >
        {{ isPolling && jobOperation === "multi-plan" ? `Planning… ${pollAttempt}` : "Multi Plan" }}
      </button>
    </div>

    <button
      v-if="jointPlanMode"
      @click="emit('start-job', 'joint-plan')"
      :disabled="isPolling || !uploadId || !movePartId"
      class="btn btn-primary w-full"
    >
      {{ isPolling ? `Planning… ${pollAttempt}` : "Run Joint Plan" }}
    </button>

    <label v-if="jointPlanMode && partOptions.length" class="block space-y-1">
      <span class="flex items-center justify-between">
        <span class="text-[11px] font-semibold text-black/55">Part to move</span>
        <button
          type="button"
          :disabled="!movePartId"
          @click="emit('reset-selection')"
          class="text-[10px] text-black/50 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </span>
      <select
        :value="movePartId"
        @change="emit('update:movePartId', ($event.target as HTMLSelectElement).value)"
        class="w-full text-[12px] bg-white border border-black/10 rounded px-2 py-1.5 text-carbon focus:outline-none focus:border-primary"
      >
        <option value="" disabled>Choose a part to move</option>
        <option v-for="part in partOptions" :key="part.id" :value="part.id">
          {{ part.label }}
        </option>
      </select>
      <span v-if="selectedMeshName" class="block text-[10px] text-primary">
        Selected mesh: {{ selectedMeshName }}
      </span>
      <span v-if="movePartId" class="block text-[10px] text-black/40">
        Moving: {{ partOptions.find((part) => part.id === movePartId)?.label || movePartId }}
      </span>
      <span v-else class="block text-[10px] text-black/40">Select a mesh or choose a part above.</span>
    </label>

    <p v-if="jointPlanMode" class="text-[11px] text-primary mt-2">
      <span class="material-icons text-[12px] align-middle">info</span>
      Click a model part or choose it here. Only one part can be selected at a time.
    </p>

    <p v-if="jobId" class="text-[11px] text-black/45 mono truncate">
      Task: <span class="text-primary font-semibold">{{ jobId }}</span>
      <span> ({{ jobOperation || "?" }})</span>
    </p>
  </section>
</template>
