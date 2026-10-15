<script setup lang="ts">
defineProps<{ logs: string[] }>();
</script>

<template>
  <section class="app-card overflow-hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-[96px]">
    <header class="flex items-center justify-between px-4 pt-3 pb-2">
      <h2 class="app-label">Console</h2>
      <span class="text-[11px] text-black/35">{{ logs.length }} entries</span>
    </header>
    <div class="mono text-[11px] leading-5 text-carbon bg-[#fafafa] border-t border-black/5 px-4 py-3 h-24 lg:h-auto lg:flex-1 lg:min-h-[56px] overflow-y-auto space-y-0.5">
      <p v-for="(log, i) in logs" :key="i" class="break-all">{{ log }}</p>
      <p v-if="logs.length === 0" class="text-black/35">No output yet.</p>
    </div>
  </section>
</template>
