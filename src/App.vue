<template>
  <div class="flex flex-col md:flex-row h-dvh bg-app text-inverse font-sans overflow-hidden">
    <!-- Mobile tab switcher (desktop shows both panes side by side) -->
    <div class="md:hidden shrink-0 flex gap-2 p-2 bg-surface border-b border-black/10">
      <button
        @click="mobileTab = 'studio'"
        :class="mobileTab === 'studio' ? 'btn-primary' : 'btn-outline border-0 text-black/50'"
        class="btn flex-1"
      >
        <span class="material-icons text-[16px]">tune</span>
        Studio
      </button>
      <button
        @click="mobileTab = 'player'"
        :class="mobileTab === 'player' ? 'btn-primary' : 'btn-outline border-0 text-black/50'"
        class="btn flex-1"
      >
        <span class="material-icons text-[16px]">view_in_ar</span>
        Player
      </button>
    </div>

    <!-- Left pane: studio panel -->
    <div
      :class="[
        panelVisibility,
        'w-full md:w-auto md:flex-[3_1_0%] md:shrink-0 p-3 flex-col gap-3 bg-app md:border-r border-black/10 overflow-y-auto flex-1 min-h-0',
      ]"
    >
      <PanelHeader :sys-status="sysStatus" :phase="phase" :playback="playback" />

      <UploadSection :phase="phase" :upload-id="uploadId" :model-names="modelNames" @upload="handleUpload" />

      <JobConfigSection
        :is-polling="isPolling"
        :poll-attempt="pollAttempt"
        :upload-id="uploadId"
        :job-id="jobId"
        :job-operation="jobOperation"
        :joint-plan-mode="jointPlanMode"
        :part-options="movePartOptions"
        :selected-mesh-name="selectedObjectName"
        :move-part-id="movePartId"
        @update:move-part-id="handleMovePartChange"
        @reset-selection="clearMeshSelection(true)"
        @start-job="onStartJob"
        @joint-plan-mode="onJointPlanClick"
      />

      <JobFailureCard v-if="jobFailure" :job-failure="jobFailure" />

      <AnimationJsonCard :animations="animations" />

    </div>

    <!-- Right pane: player -->
    <div :class="[viewerVisibility, 'flex-1 min-h-0 p-2 sm:p-3 relative bg-app md:flex-[7_1_0%]']">
      <AssemblyViewer
        :models="viewerModels"
        :animations="animations"
        :selected-part-id="jointPlanMode ? movePartId : ''"
        :allow-mesh-selection="jointPlanMode && !isPolling && models.length > 0"
        :selection-reset-key="selectionResetKey"
        :on-mesh-bound="onMeshBound"
        :on-mesh-missing="onMeshMissing"
        @playback-change="playback = $event"
        @mesh-selected="handleMeshSelected"
      />
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import PanelHeader from "./components/panel/PanelHeader.vue";
import UploadSection from "./components/panel/UploadSection.vue";
import JobConfigSection from "./components/panel/JobConfigSection.vue";
import JobFailureCard from "./components/panel/JobFailureCard.vue";
import AnimationJsonCard from "./components/panel/AnimationJsonCard.vue";
import AssemblyViewer from "./components/viewer/AssemblyViewer.vue";
import { useAssemblyJob } from "./composables/useAssemblyJob";

const {
  sysStatus,
  phase,
  playback,
  uploadId,
  models,
  modelNames,
  viewerModels,
  jobId,
  jobOperation,
  isPolling,
  pollAttempt,
  animations,
  jobFailure,
  handleUpload,
  handleStartJob,
  onMeshBound,
  onMeshMissing,
  currentPartIds,
  movePartId,
} = useAssemblyJob();

// Track if Joint Plan mode is selected (for enabling mesh selection)
const jointPlanMode = ref(false);
const selectionResetKey = ref(0);
const movePartOptions = computed(() =>
  currentPartIds.value.map((partId) => {
    const model = models.value.find((item) => item.partId === partId);
    const label = model?.objectName || model?.fileName || partId;
    return { id: partId, label: `${label} (${partId})` };
  })
);

function onJointPlanClick() {
  jointPlanMode.value = !jointPlanMode.value;
  if (!jointPlanMode.value) clearMeshSelection(true);
}

function onStartJob(endpoint: "joint-plan" | "multi-plan") {
  const submission = handleStartJob(endpoint);
  if (endpoint === "joint-plan") {
    jointPlanMode.value = false;
    clearMeshSelection(true);
  }
  void submission;
}

// Active pane on small screens (desktop always shows both panes).
const mobileTab = ref<"studio" | "player">("studio");
const panelVisibility = computed(() => (mobileTab.value === "studio" ? "flex" : "hidden md:flex"));
const viewerVisibility = computed(() => (mobileTab.value === "player" ? "block" : "hidden md:block"));

// Submesh selection state
const selectedObjectName = ref<string>("");

function handleMeshSelected(objectName: string, partId: string) {
  if (!partId) {
    clearMeshSelection(true);
    return;
  }
  selectedObjectName.value = objectName;
  movePartId.value = partId;
}

function clearMeshSelection(clearMoveTarget: boolean) {
  selectedObjectName.value = "";
  if (clearMoveTarget) movePartId.value = "";
  selectionResetKey.value++;
}

function handleMovePartChange(partId: string) {
  movePartId.value = partId;
  const model = models.value.find((item) => item.partId === partId);
  selectedObjectName.value = model?.objectName || model?.fileName || "";
}

// On mobile, jump straight to the player as soon as paths are ready to play.
watch(phase, (p) => {
  if (p === "ready-to-play") mobileTab.value = "player";
});

watch(uploadId, () => {
  jointPlanMode.value = false;
  clearMeshSelection(true);
});
</script>
