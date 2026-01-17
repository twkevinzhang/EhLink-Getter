<script setup lang="ts">
import { useAppStore } from "../stores/app";

const store = useAppStore();
</script>

<template>
  <div class="tab-pane flex flex-col h-full overflow-hidden">
    <div class="mb-8">
      <h1
        class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
      >
        System Logs
      </h1>
      <p class="text-text-muted mt-2">Real-time sidecar output</p>
    </div>
    <div class="flex-1 flex flex-col overflow-hidden h-[500px] glass-card">
      <div
        class="p-3 px-5 border-b border-glass-border flex justify-between items-center font-semibold text-[0.9rem]"
      >
        <span>Output Console</span>
        <el-button link @click="store.logs = []">Clear</el-button>
      </div>
      <div
        class="p-5 flex-1 overflow-y-auto font-mono text-[0.85rem] bg-black/20"
      >
        <div
          v-for="(log, idx) in store.logs"
          :key="idx"
          class="mb-1 whitespace-pre-wrap"
          :class="
            log.level === 'error'
              ? 'text-red-400'
              : log.level === 'warn'
                ? 'text-amber-400'
                : 'text-slate-400'
          "
        >
          <span class="text-slate-500 mr-2.5">[{{ log.timestamp }}]</span>
          <span>{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
