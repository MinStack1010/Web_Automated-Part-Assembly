<script setup lang="ts">
defineProps<{
  payloadJson: string;
  isPolling: boolean;
  pollAttempt: number;
  uploadId: string | null;
  jobId: string | null;
  jobOperation: string;
}>();

const emit = defineEmits<{
  (e: "update:payloadJson", value: string): void;
  (e: "start-job", endpoint: "joint-plan" | "multi-plan"): void;
}>();
</script>

<template>
  <section class="app-card p-4 space-y-3 lg:flex lg:flex-col lg:flex-1 lg:min-h-[150px] lg:overflow-hidden">
    <h2 class="app-label">2 · Sequence &amp; Path Planning</h2>

    <textarea
      :value="payloadJson"
      @input="emit('update:payloadJson', ($event.target as HTMLTextAreaElement).value)"
      class="field mono h-40 lg:h-auto lg:flex-1 lg:min-h-[56px] resize-y !bg-[#fafafa] !text-carbon text-[12px] leading-5"
      spellcheck="false"
    />

    <div class="flex gap-2">
      <button
        @click="emit('start-job', 'joint-plan')"
        :disabled="isPolling || !uploadId"
        class="btn btn-primary flex-1"
      >
        {{ isPolling ? `Planning… ${pollAttempt}` : "Joint Plan" }}
      </button>
      <button
        @click="emit('start-job', 'multi-plan')"
        :disabled="isPolling || !uploadId"
        class="btn btn-primary flex-1"
      >
        {{ isPolling ? `Planning… ${pollAttempt}` : "Multi Plan" }}
      </button>
    </div>

    <p v-if="jobId" class="text-[11px] text-black/45 mono truncate">
      Task: <span class="text-primary font-semibold">{{ jobId }}</span>
      <span> ({{ jobOperation || "?" }})</span>
    </p>
  </section>
</template>
