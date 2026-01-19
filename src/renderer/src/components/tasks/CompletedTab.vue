<script setup lang="ts">
import { ref } from "vue";

const completedTasks = ref([
  {
    id: 1,
    title: "[Artist] Masterpiece",
    date: "2026-01-19 10:00",
    size: "450MB",
    status: "success",
  },
  {
    id: 2,
    title: "[Group] Collection Vol.1",
    date: "2026-01-18 15:30",
    size: "1.2GB",
    status: "success",
  },
]);
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="font-bold mb-2">Completed Tasks</div>
    <div class="flex-1 overflow-y-auto">
      <el-table :data="completedTasks" style="width: 100%" class="eh-table">
        <el-table-column prop="title" label="Title" show-overflow-tooltip />
        <el-table-column prop="date" label="Completed Date" width="180" />
        <el-table-column prop="size" label="Size" width="100" />
        <el-table-column label="Action" width="100">
          <template #default>
            <el-button link type="primary">Open</el-button>
            <el-button link type="danger">Delete</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.eh-table {
  @apply !bg-transparent;
}
:deep(.el-table__header-wrapper th) {
  @apply !bg-eh-panel !text-eh-muted !border-eh-border;
}
:deep(.el-table__row td) {
  @apply !bg-transparent !border-eh-border !text-eh-text;
}
</style>
