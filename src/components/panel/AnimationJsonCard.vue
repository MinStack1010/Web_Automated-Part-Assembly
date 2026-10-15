<script setup lang="ts">
import { computed, ref } from "vue";
import type { PartAnimation } from "../../lib/types";

const props = defineProps<{ animations: PartAnimation[] }>();
const copied = ref(false);
const json = computed(() => JSON.stringify(props.animations, null, 2));

async function copyJson() {
  await navigator.clipboard.writeText(json.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1800);
}

function downloadJson() {
  const url = URL.createObjectURL(new Blob([json.value], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "animation-paths.json";
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="app-card shrink-0 p-4 space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="app-label">Animation JSON</h2>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" :disabled="!animations.length" @click="copyJson">
          {{ copied ? "Copied" : "Copy JSON" }}
        </button>
        <button class="btn btn-outline btn-sm" :disabled="!animations.length" @click="downloadJson">
          Download JSON
        </button>
      </div>
    </div>
    <pre v-if="animations.length" class="max-h-64 overflow-auto rounded border border-black/10 bg-black/[0.03] p-3 mono text-[10px] leading-relaxed">{{ json }}</pre>
    <p v-else class="text-[11px] text-black/45">Animation path JSON will appear here when the job result is ready.</p>
  </section>
</template>
