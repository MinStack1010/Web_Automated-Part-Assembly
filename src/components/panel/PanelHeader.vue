<script setup lang="ts">
import { PHASE_LABEL, type Phase, type PlaybackState } from "../../lib/types";

defineProps<{
  sysStatus: string;
  phase: Phase;
  playback: PlaybackState;
}>();
</script>

<template>
  <div class="space-y-2 pt-1">
    <h1 class="app-title text-inverse">Assembly Studio</h1>
    <!-- <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-black/55">
      <span class="inline-flex items-center gap-1.5">
        <span
          class="w-2 h-2 rounded-full"
          :class="sysStatus === 'Online' ? 'bg-success' : 'bg-error'"
        ></span>
        Backend: {{ sysStatus }}
      </span>
      <span class="badge bg-primary/10 text-primary">{{ PHASE_LABEL[phase] }}</span>
      <span v-if="playback !== 'stopped'" class="badge bg-carbon/10 text-carbon">
        Player: {{ playback }}
      </span>
    </div> -->
  </div>
</template>
