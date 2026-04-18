<!-- src/renderer/src/components/shared/DownloadConfigPanel.vue -->
<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useFetchStore } from '@renderer/stores/fetch'

const props = defineProps<{
  modelValue: string
  useZip: boolean
  zipPass: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:useZip': [value: boolean]
  'update:zipPass': [value: string]
}>()

const fetchStore = useFetchStore()

const handleBrowse = async () => {
  const result = await fetchStore.selectDirectory()
  if (result) emit('update:modelValue', result)
}

const handlePlaceholder = (placeholder: string) => {
  emit('update:modelValue', (props.modelValue || '') + placeholder)
}
</script>

<template>
  <div class="eh-panel-card overflow-hidden">
    <div class="eh-header">Download Configuration</div>
    <div class="p-4 flex flex-col gap-4 text-xs">
      <div class="flex flex-col gap-2">
        <label class="text-[10px] text-eh-muted font-bold uppercase">Target Path:</label>
        <div class="flex gap-2">
          <InputText
            :modelValue="modelValue"
            size="small"
            class="flex-1 !p-1.5 !text-xs"
            @update:modelValue="emit('update:modelValue', $event as string)"
          />
          <Button
            label="Browse"
            size="small"
            outlined
            class="!py-1 !px-3"
            @click="handleBrowse"
          />
        </div>
        <div class="flex gap-2 mt-1">
          <Button
            v-for="p in ['{EN_TITLE}', '{GID}', '{JP_TITLE}']"
            :key="p"
            :label="p"
            size="small"
            text
            class="!text-[10px] !p-1 !bg-eh-panel/20"
            @click="handlePlaceholder(p)"
          />
        </div>
      </div>

      <div class="flex items-center gap-6 mt-2">
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-eh-muted font-bold uppercase">Archive</span>
          <ToggleSwitch
            :modelValue="useZip"
            @update:modelValue="emit('update:useZip', $event as boolean)"
          />
        </div>
        <div v-if="useZip" class="flex items-center gap-2 flex-1">
          <span class="text-[10px] text-eh-muted font-bold uppercase">Password:</span>
          <InputText
            :modelValue="zipPass"
            size="small"
            placeholder="Optional"
            class="flex-1 !p-1.5 !text-xs"
            @update:modelValue="emit('update:zipPass', $event as string)"
          />
        </div>
      </div>

      <p class="text-[9px] text-eh-muted italic mt-1 border-t border-eh-border/30 pt-2">
        * Placeholders will be replaced with actual gallery information.
      </p>
    </div>
  </div>
</template>
