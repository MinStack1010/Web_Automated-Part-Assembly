<script setup lang="ts">
import type { ArtifactProgress, PartAnimation } from "../../lib/types";

defineProps<{
  artifactProgress: ArtifactProgress | null;
  animations: PartAnimation[];
  missingParts: string[];
}>();
</script>

<template>
  <section class="app-card p-4 space-y-2">
    <h2 class="app-label">Motion Paths</h2>

    <p v-if="artifactProgress" class="mono text-[11px] text-black/50">
      Loading artifacts: {{ artifactProgress.done }}/{{ artifactProgress.total }} —
      {{ artifactProgress.current }}
    </p>

    <ul class="space-y-1.5">
      <li
        v-for="a in animations"
        :key="a.partId"
        class="mono text-[11px] text-carbon flex items-start gap-2"
      >
        <span class="material-icons text-success text-[14px] leading-[14px]">check_circle</span>
        <span>
          {{ a.partId }} <span class="text-black/40">→</span> {{ a.fileName }}
          <span class="text-black/45">({{ a.frames.length }} steps)</span>
        </span>
      </li>
      <li
        v-for="m in missingParts"
        :key="m"
        class="mono text-[11px] text-warning flex items-start gap-2"
      >
        <span class="material-icons text-warning text-[14px] leading-[14px]">warning</span>
        <span>{{ m }}</span>
      </li>
    </ul>
  </section>
</template>
