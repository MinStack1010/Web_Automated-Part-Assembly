<script setup lang="ts">
import type { JobFailure } from "../../lib/types";

defineProps<{ jobFailure: JobFailure }>();
</script>

<template>
  <section class="app-card p-4 space-y-2 border-l-4 border-error">
    <h2 class="app-label !text-error">Task failed — no motion path</h2>
    <dl class="mono text-[11px] space-y-1 text-carbon">
      <div class="flex gap-2">
        <dt class="w-16 shrink-0 text-black/45">task_id</dt>
        <dd class="break-all">{{ jobFailure.jobId }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="w-16 shrink-0 text-black/45">operation</dt>
        <dd>{{ jobFailure.operation }} · {{ jobFailure.status }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="w-16 shrink-0 text-black/45">code</dt>
        <dd class="text-error font-semibold">{{ jobFailure.code }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="w-16 shrink-0 text-black/45">message</dt>
        <dd class="whitespace-pre-wrap break-all">{{ jobFailure.message }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="w-16 shrink-0 text-black/45">artifacts</dt>
        <dd class="break-all">
          {{ jobFailure.artifacts.length ? jobFailure.artifacts.join(", ") : "(none written)" }}
        </dd>
      </div>
    </dl>
  </section>
</template>
