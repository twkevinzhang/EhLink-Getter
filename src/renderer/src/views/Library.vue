<script setup lang="ts">
import { ref } from "vue";
import { Search } from "@element-plus/icons-vue";

const searchTag = ref("");
const ratings = ref(0);
const expunged = ref(false);

const galleries = ref([
  { id: 1, title: "Sample Comic A", rating: 5, language: "Chinese", thumb: "" },
  { id: 2, title: "Sample Comic B", rating: 4, language: "English", thumb: "" },
]);
</script>

<template>
  <div class="library-view h-full flex flex-col gap-6">
    <el-card>
      <template #header>
        <div class="flex items-center gap-4">
          <el-input
            v-model="searchTag"
            placeholder="language:chinese tag:color ..."
            class="flex-1"
          >
            <template #append>
              <el-button :icon="Search">Search</el-button>
            </template>
          </el-input>
        </div>
      </template>
      <div class="flex items-center gap-6 text-sm text-eh-muted">
        <el-checkbox v-model="expunged" label="Expunged" />
        <div class="flex items-center gap-2">
          <span>Rating > </span>
          <el-rate v-model="ratings" />
        </div>
      </div>
    </el-card>

    <div class="gallery-grid flex-1 overflow-y-auto">
      <div class="flex flex-col gap-3">
        <div
          v-for="g in galleries"
          :key="g.id"
          class="eh-panel-card flex overflow-hidden hover:border-eh-accent transition-colors cursor-pointer"
        >
          <!-- Thumbnail Section -->
          <div
            class="w-[120px] aspect-[2/3] bg-eh-panel border-r border-eh-border flex items-center justify-center text-eh-muted shrink-0"
          >
            <span class="text-[10px] text-center px-1">[ Thumbnail ]</span>
          </div>

          <!-- Metadata Section -->
          <div class="flex-1 p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-4">
              <span
                class="font-bold text-eh-text hover:underline text-sm leading-tight"
                >{{ g.title }}</span
              >
              <div class="cat-badge bg-eh-cat-doujinshi">Doujinshi</div>
            </div>

            <div class="flex flex-wrap gap-2 mt-auto">
              <span
                class="text-[11px] px-1 bg-eh-sidebar border border-eh-border rounded-sm text-eh-muted"
                >artist: suzuki nago</span
              >
              <span
                class="text-[11px] px-1 bg-eh-sidebar border border-eh-border rounded-sm text-eh-muted"
                >language: chinese</span
              >
              <span
                class="text-[11px] px-1 bg-eh-sidebar border border-eh-border rounded-sm text-eh-muted"
                >translated</span
              >
            </div>

            <div
              class="flex items-center justify-between text-[11px] text-eh-muted mt-1"
            >
              <div class="flex items-center gap-2">
                <el-rate v-model="g.rating" disabled size="small" />
                <span>{{ g.rating }} stars</span>
              </div>
              <span class="font-mono">2026-01-19 11:40</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-center p-4">
      <el-pagination layout="prev, pager, next" :total="50" />
    </div>
  </div>
</template>

<style scoped>
:deep(.el-rate) {
  --el-rate-fill-color: #ffae00;
}
</style>
