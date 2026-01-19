<script setup lang="ts">
import { ref } from "vue";

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
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <el-card
          v-for="g in galleries"
          :key="g.id"
          :body-style="{ padding: '0px' }"
          class="hover:border-eh-accent transition-colors"
        >
          <div
            class="aspect-[2/3] bg-eh-bg flex items-center justify-center text-eh-muted"
          >
            <span>[ Thumb ]</span>
          </div>
          <div class="p-4">
            <div class="font-bold truncate">{{ g.title }}</div>
            <div
              class="flex items-center justify-between mt-2 text-xs text-eh-muted"
            >
              <el-rate v-model="g.rating" disabled />
              <span>{{ g.language }}</span>
            </div>
          </div>
        </el-card>
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
