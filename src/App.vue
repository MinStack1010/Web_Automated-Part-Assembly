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
        'w-full md:w-auto md:flex-[3_1_0%] md:shrink-0 p-3 flex-col gap-3 bg-app md:border-r border-black/10 overflow-y-auto md:overflow-hidden flex-1 min-h-0',
      ]"
    >
      <PanelHeader :sys-status="sysStatus" :phase="phase" :playback="playback" />

      <UploadSection :phase="phase" :upload-id="uploadId" :model-names="modelNames" @upload="handleUpload" />

      <JobConfigSection
        v-model:payload-json="payloadJson"
        :is-polling="isPolling"
        :poll-attempt="pollAttempt"
        :upload-id="uploadId"
        :job-id="jobId"
        :job-operation="jobOperation"
        @start-job="handleStartJob"
      />

      <JobFailureCard v-if="jobFailure" :job-failure="jobFailure" />

      <AnimationPathsCard
        v-if="artifactProgress || animations.length > 0 || missingParts.length > 0"
        :artifact-progress="artifactProgress"
        :animations="animations"
        :missing-parts="missingParts"
      />

      <JobInspector
        v-model:job-id-input="jobIdInput"
        @check-status="handleCheckStatus"
        @get-result="handleGetResult"
        @cancel-job="handleCancelJob"
        @download-zip="handleDownloadZip"
      />

      <LogConsole :logs="logs" />
    </div>

    <!-- Right pane: player -->
    <div :class="[viewerVisibility, 'flex-1 min-h-0 p-2 sm:p-3 relative bg-app md:flex-[7_1_0%]']">
      <div
        v-if="isPolling"
        class="absolute top-8 left-8 z-20 app-card px-4 py-2 flex items-center gap-2 text-primary animate-pulse"
      >
        <span class="material-icons text-[16px]">progress_activity</span>
        <span class="text-[12px] font-semibold uppercase tracking-wide">
          Planning path… ({{ pollAttempt }})
        </span>
      </div>
      <AssemblyViewer
        :models="viewerModels"
        :animations="animations"
        @playback-change="playback = $event"
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
import AnimationPathsCard from "./components/panel/AnimationPathsCard.vue";
import JobInspector from "./components/panel/JobInspector.vue";
import LogConsole from "./components/panel/LogConsole.vue";
import AssemblyViewer from "./components/viewer/AssemblyViewer.vue";
import { useAssemblyJob } from "./composables/useAssemblyJob";

const {
  logs,
  sysStatus,
  phase,
  playback,
  uploadId,
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
  handleUpload,
  handleStartJob,
  handleCheckStatus,
  handleGetResult,
  handleCancelJob,
  handleDownloadZip,
} = useAssemblyJob();

// Active pane on small screens (desktop always shows both panes).
const mobileTab = ref<"studio" | "player">("studio");
const panelVisibility = computed(() => (mobileTab.value === "studio" ? "flex" : "hidden md:flex"));
const viewerVisibility = computed(() => (mobileTab.value === "player" ? "block" : "hidden md:block"));

// On mobile, jump straight to the player as soon as paths are ready to play.
watch(phase, (p) => {
  if (p === "ready-to-play") mobileTab.value = "player";
});
</script>
