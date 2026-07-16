<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch'
import InputText from 'primevue/inputtext'
import { useWorkspaceStore } from '@renderer/stores/workspace'

defineProps<{
  useZip: boolean
  zipPass: string
}>()

const emit = defineEmits<{
  'update:useZip': [value: boolean]
  'update:zipPass': [value: string]
}>()

const workspace = useWorkspaceStore()
</script>

<template>
  <div class="eh-panel-card overflow-hidden">
    <div class="eh-header">下載設定</div>
    <div class="flex flex-col gap-4 p-4 text-xs">
      <div
        class="flex items-center gap-3 rounded-md border border-eh-border/15 bg-eh-bg/60 p-3"
      >
        <i class="pi pi-folder text-eh-text"></i>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-eh-text">下載到工作資料夾</p>
          <p
            class="mt-0.5 truncate font-mono text-[10px] text-eh-muted"
            :title="workspace.path"
          >
            {{ workspace.path || '尚未設定工作資料夾' }}/galleries/&lt;gid&gt;
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-6">
        <label class="flex cursor-pointer items-center gap-2">
          <span class="text-[10px] font-bold uppercase text-eh-muted">建立 ZIP</span>
          <ToggleSwitch
            :modelValue="useZip"
            @update:modelValue="emit('update:useZip', $event as boolean)"
          />
        </label>
        <label v-if="useZip" class="flex min-w-[16rem] flex-1 items-center gap-2">
          <span class="text-[10px] font-bold uppercase text-eh-muted">密碼</span>
          <InputText
            :modelValue="zipPass"
            size="small"
            placeholder="選填"
            class="flex-1 !p-1.5 !text-xs"
            @update:modelValue="emit('update:zipPass', $event as string)"
          />
        </label>
      </div>
    </div>
  </div>
</template>
