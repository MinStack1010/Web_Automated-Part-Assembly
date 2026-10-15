<script setup lang="ts">
defineProps<{ jobIdInput: string }>();

const emit = defineEmits<{
  (e: "update:jobIdInput", value: string): void;
  (e: "check-status"): void;
  (e: "get-result"): void;
  (e: "cancel-job"): void;
  (e: "download-zip"): void;
}>();
</script>

<template>
  <section class="app-card p-4 space-y-3">
    <h2 class="app-label">Task Inspector</h2>

    <input
      type="text"
      :value="jobIdInput"
      @input="emit('update:jobIdInput', ($event.target as HTMLInputElement).value)"
      placeholder="Paste Task ID…"
      class="field mono text-[12px] !text-carbon"
    />

    <div class="grid grid-cols-2 gap-2">
      <button @click="emit('check-status')" class="btn btn-outline btn-sm">Check Status</button>
      <button @click="emit('get-result')" class="btn btn-outline btn-sm">Get Result</button>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <button @click="emit('cancel-job')" class="btn btn-danger btn-sm">Cancel Task</button>
      <button @click="emit('download-zip')" class="btn btn-outline btn-sm">Download ZIP</button>
    </div>
  </section>
</template>
