<script setup lang="ts">
import { useLogStore } from "../stores/logs";

const store = useLogStore();
</script>

<template>
  <div class="tab-pane flex flex-col h-full overflow-hidden">
    <!-- Header Area -->
    <div class="mb-4">
      <h1 class="text-2xl font-bold text-eh-text m-0">System Logs</h1>
      <p class="text-eh-muted mt-1 text-sm">Real-time sidecar output</p>
    </div>

    <!-- Console Terminal -->
    <div
      class="flex-1 flex flex-col overflow-hidden border border-eh-border bg-eh-panel rounded-sm shadow-inner group"
    >
      <div
        class="px-4 py-2 border-b border-eh-border flex justify-between items-center bg-eh-sidebar"
      >
        <span
          class="text-xs font-bold uppercase tracking-wider text-eh-muted flex items-center gap-2"
        >
          <div
            class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_#22c55e]"
          ></div>
          Output Console
        </span>
        <el-button
          link
          size="small"
          class="!text-eh-accent !text-[11px] hover:underline"
          @click="store.logs = []"
        >
          CLEAR LOGS
        </el-button>
      </div>

      <div
        class="p-4 flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed bg-eh-sidebar"
      >
        <div
          v-for="(log, idx) in store.logs"
          :key="idx"
          class="mb-1.5 flex gap-3 group/line"
        >
          <span
            class="text-eh-muted/60 shrink-0 font-light text-[11px] pt-0.5 select-none"
          >
            {{ log.timestamp }}
          </span>
          <span
            class="break-all whitespace-pre-wrap"
            :class="{
              'text-red-600 font-bold': log.level === 'error',
              'text-amber-700 font-bold': log.level === 'warn',
              'text-blue-700': log.level === 'info',
              'text-eh-text': !log.level || log.level === 'debug',
            }"
          >
            {{ log.message }}
          </span>
        </div>

        <!-- Empty State -->
        <div
          v-if="store.logs.length === 0"
          class="h-full flex items-center justify-center text-eh-muted/30 italic text-sm"
        >
          Waiting for logs...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar for terminal look */
.overflow-y-auto::-webkit-scrollbar {
  width: 5px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}
</style>
