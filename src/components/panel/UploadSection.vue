<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps<{
  phase: string;
  uploadId: string | null;
  modelNames: string[];
}>();

const emit = defineEmits<{
  (e: "upload", files: File[]): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const staged = ref<File[]>([]);
const dragover = ref(false);
let dragDepth = 0;

function browse() {
  fileInputRef.value?.click();
}

function addFiles(files: File[]) {
  for (const f of files) {
    if (!staged.value.some((s) => s.name === f.name && s.size === f.size)) staged.value.push(f);
  }
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = "";
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragDepth = 0;
  dragover.value = false;
  addFiles(Array.from(e.dataTransfer?.files ?? []));
}

function onDragEnter() {
  dragDepth++;
  dragover.value = true;
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragover.value = false;
}

function removeFile(index: number) {
  staged.value.splice(index, 1);
}

function onUpload() {
  if (staged.value.length === 0) return;
  emit("upload", [...staged.value]);
  staged.value = [];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const canUpload = computed(() => staged.value.length > 0 && props.phase !== "uploading");
</script>

<template>
  <section class="app-card p-4 space-y-3">
    <header class="flex items-center justify-between">
      <h2 class="app-label">1 · Upload Parts</h2>
      <span class="text-[11px] text-black/40">.obj</span>
    </header>

    <!-- Drop zone — same pattern as client's rely-layout-dnd (border-dashed + drag overlay) -->
    <div
      class="relative rounded-lg border border-dashed px-4 py-5 cursor-pointer transition-colors select-none"
      :class="
        dragover
          ? 'border-secondary bg-secondary/10'
          : 'border-lightgrey bg-[#fafbfb] hover:border-primary hover:bg-primary/5'
      "
      @click="browse"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="dragover = true"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept=".obj"
        class="hidden"
        @change="onFilesSelected"
      />
      <!-- client uses a secondary-colored v-overlay while dragging -->
      <div
        v-if="dragover"
        class="absolute inset-0 rounded-lg bg-secondary/20 pointer-events-none"
      ></div>

      <div class="flex flex-col items-center gap-1.5 text-center pointer-events-none">
        <span class="material-icons text-primary" style="font-size: 44px; line-height: 44px">
          cloud_download
        </span>
        <p class="text-[13px] font-semibold text-carbon mt-1">Drop your parts here</p>
        <p class="text-[11px] text-black/45">Click to browse, or drag &amp; drop .obj files</p>
        <p class="text-[10px] text-black/35">(Compatible files include .OBJ)</p>
      </div>
    </div>

    <!-- Staged files (client lists name + size + remove action before uploading) -->
    <ul
      v-if="staged.length > 0"
      class="rounded-md border border-black/5 overflow-hidden divide-y divide-black/5"
    >
      <li
        v-for="(f, i) in staged"
        :key="`${f.name}-${i}`"
        class="flex items-center gap-2 bg-[#fafafa] px-3 py-2"
      >
        <span class="material-icons text-lightgrey text-[16px]">insert_drive_file</span>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-medium text-carbon truncate">{{ f.name }}</p>
          <p class="mono text-[10px] text-black/40">{{ fmtSize(f.size) }} bytes</p>
        </div>
        <button
          type="button"
          class="rounded p-1 text-black/35 hover:text-error hover:bg-error/10 transition-colors"
          title="Remove"
          @click.stop="removeFile(i)"
        >
          <span class="material-icons text-[15px]">close</span>
        </button>
      </li>
    </ul>

    <button class="btn btn-secondary w-full" :disabled="!canUpload" @click="onUpload">
      <span class="material-icons text-[16px]">upload</span>
      {{ phase === "uploading" ? "Uploading…" : `Upload Parts${staged.length ? ` (${staged.length})` : ""}` }}
    </button>

    <dl v-if="uploadId || modelNames.length > 0" class="mono text-[11px] space-y-1 pt-1 text-black/50">
      <div v-if="uploadId" class="flex gap-2">
        <dt class="w-20 shrink-0 whitespace-nowrap">Upload ID</dt>
        <dd class="text-carbon break-all">{{ uploadId }}</dd>
      </div>
      <div v-if="modelNames.length > 0" class="flex gap-2">
        <dt class="w-20 shrink-0 whitespace-nowrap">Parts</dt>
        <dd class="text-carbon break-all">{{ modelNames.join(", ") }}</dd>
      </div>
    </dl>
  </section>
</template>
