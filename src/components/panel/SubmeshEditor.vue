<script setup lang="ts">
import { ref, computed, watch } from "vue";

interface MappingEntry {
  objectName: string;
  partId: string;
}

const props = defineProps<{
  objectNames: string[];
  partIds: string[];
  initialMapping?: Record<string, string> | undefined;
  selectedObjectName?: string;
}>();

const emit = defineEmits<{
  (e: "confirm", mapping: Record<string, string>): void;
  (e: "cancel"): void;
}>();

// Initialize with auto-mapping (by index) or user-provided mapping
const mapping = ref<Record<string, string>>({} as Record<string, string>);
(() => {
  const map: Record<string, string> = {};
  if (props.initialMapping) {
    Object.assign(map, props.initialMapping);
  } else {
    props.objectNames.forEach((name, i) => {
      map[name] = props.partIds[i] || "";
    });
  }
  mapping.value = map;
})();

// Refs for auto-scroll
const rowRefs = ref<Map<string, HTMLDivElement>>(new Map());

// Auto-scroll to selected row when it changes
watch(() => props.selectedObjectName, (newName) => {
  if (newName) {
    const row = rowRefs.value.get(newName);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
});

const unmappedCount = computed(() => {
  return Object.values(mapping.value).filter((v) => !v).length;
});

function updateMapping(objectName: string, partId: string) {
  mapping.value[objectName] = partId;
}

function handleConfirm() {
  emit("confirm", mapping.value);
}

function handleCancel() {
  emit("cancel");
}
</script>

<template>
  <div class="app-card p-4 space-y-3">
    <header class="flex items-center justify-between">
      <h2 class="app-label">Edit Submesh Mapping</h2>
      <span class="text-[11px] text-black/40">
        {{ unmappedCount }} unmapped
      </span>
    </header>

    <p class="text-[12px] text-black/60">
      The backend detected {{ partIds.length }} part(s). Assign each sub-mesh to a part ID.
    </p>

    <div class="rounded-md border border-black/10 overflow-hidden divide-y divide-black/5">
      <div
        v-for="objectName in objectNames"
        :key="objectName"
        :ref="(el) => el ? rowRefs.set(objectName, el as HTMLDivElement) : null"
        class="flex items-center gap-2 px-3 py-2 transition-colors"
        :class="[
          selectedObjectName === objectName ? 'bg-primary/10 border-l-4 border-primary' : 'bg-[#fafafa]'
        ]"
      >
        <span class="material-icons text-lightgrey text-[16px]">category</span>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-medium text-carbon truncate">{{ objectName }}</p>
          <p class="text-[10px] text-black/40">Sub-mesh</p>
        </div>
        <select
          :value="mapping[objectName]"
          @change="updateMapping(objectName, ($event.target as HTMLSelectElement).value)"
          class="text-[11px] bg-white border border-black/10 rounded px-2 py-1 text-carbon focus:outline-none focus:border-primary"
        >
          <option value="">-- Select part --</option>
          <option v-for="partId in partIds" :key="partId" :value="partId">
            {{ partId }}
          </option>
        </select>
      </div>
    </div>

    <div class="flex gap-2">
      <button class="btn btn-outline flex-1" @click="handleCancel">
        Cancel
      </button>
      <button
        class="btn btn-primary flex-1"
        :disabled="unmappedCount > 0"
        @click="handleConfirm"
      >
        Apply & Reload
      </button>
    </div>
  </div>
</template>
