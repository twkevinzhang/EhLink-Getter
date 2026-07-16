<script setup lang="ts">
import Button from 'primevue/button'
import { useWorkspaceStore } from '@renderer/stores/workspace'

defineProps<{
  featureName: string
}>()

const workspace = useWorkspaceStore()
</script>

<template>
  <div
    class="absolute inset-0 z-30 grid place-items-center bg-eh-bg/90 p-5 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="workspace-gate-title"
  >
    <section
      class="workspace-card w-full max-w-[34rem] overflow-hidden rounded-xl border border-eh-border bg-eh-panel shadow-2xl"
    >
      <div class="h-1 bg-eh-border"></div>
      <div class="p-7 sm:p-9">
        <div
          class="mb-5 grid h-12 w-12 place-items-center rounded-full border border-eh-border/30 bg-eh-sidebar text-eh-text"
        >
          <i class="pi pi-folder-open text-xl" aria-hidden="true"></i>
        </div>
        <p class="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-eh-accent">
          Workspace required
        </p>
        <h2 id="workspace-gate-title" class="text-2xl font-bold text-eh-text">
          先設定工作資料夾
        </h2>
        <p class="mt-3 max-w-md text-sm leading-6 text-eh-muted">
          「{{
            featureName
          }}」需要工作資料夾。所有本子、Collections、排程與工作紀錄都會保存在同一個可攜資料夾中。
        </p>

        <div
          v-if="workspace.error"
          class="mt-5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {{ workspace.error }}
        </div>

        <div class="mt-7 flex flex-wrap items-center gap-3">
          <Button
            label="選擇工作資料夾"
            icon="pi pi-folder-open"
            :loading="workspace.loading"
            @click="workspace.select"
          />
          <span class="text-xs text-eh-muted">稍後可在「設定」中變更</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-card {
  animation: workspace-card-enter 220ms ease-out both;
}

@keyframes workspace-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
}
</style>
