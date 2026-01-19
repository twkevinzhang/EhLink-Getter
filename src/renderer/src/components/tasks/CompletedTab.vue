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
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Completed Tasks</div>
      <div class="p-2 flex-1 overflow-hidden bg-white/30">
        <el-table :data="completedTasks" style="width: 100%" class="eh-table">
          <el-table-column prop="title" label="Title" show-overflow-tooltip />
          <el-table-column prop="date" label="Completed Date" width="180" />
          <el-table-column prop="size" label="Size" width="100" />
          <el-table-column label="Action" width="120">
            <template #default>
              <el-button link type="primary" class="!text-eh-text font-bold"
                >Open</el-button
              >
              <el-button link type="danger" class="font-bold">Delete</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eh-table {
  @apply !bg-transparent;
}
:deep(.el-table__header-wrapper th) {
  @apply !bg-eh-sidebar !text-eh-text !border-eh-border !font-bold;
}
:deep(.el-table__row td) {
  @apply !bg-transparent !border-eh-border !text-eh-muted !py-2;
}
:deep(.el-table__inner-wrapper::before) {
  display: none;
}
</style>
