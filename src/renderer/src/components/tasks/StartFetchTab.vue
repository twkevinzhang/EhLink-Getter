<script setup lang="ts">
import { ref } from 'vue'
import { useFetchStore } from '../../stores/fetch'
import { useToast } from 'primevue/usetoast'

const scraperStore = useFetchStore()
const toast = useToast()

const pageLink = ref('https://e-hentai.org/?f_cats=767')
const fromPage = ref(1)
const toPage = ref<string | number>(2)

const handleStartFetch = () => {
  if (!pageLink.value) {
    toast.add({
      severity: 'warn',
      summary: 'Missing Link',
      detail: 'Please enter a page or search link',
      life: 3000,
    })
    return
  }

  // Parse max pages from toPage
  let maxPages = Infinity
  if (toPage.value !== 'All' && toPage.value !== '') {
    const parsed = parseInt(toPage.value.toString())
    if (!isNaN(parsed) && parsed > 0) {
      maxPages = parsed
    }
  }
  // Parse start page
  let start = 1
  if (fromPage.value) {
    const p = parseInt(fromPage.value.toString())
    if (!isNaN(p) && p > 0) {
      start = p
    }
  }

  scraperStore
    .startFetching(pageLink.value, start, maxPages)
    .then(() =>
      toast.add({
        severity: 'success',
        summary: 'Started',
        detail: 'Fetching task started',
        life: 3000,
      }),
    )
    .catch((err) =>
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to start fetching: ${err.message}`,
        life: 5000,
      }),
    )
}
</script>

<template>
  <div class="p-4 flex flex-col gap-6">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Page / Search Link</div>
      <div class="p-4">
        <InputText
          v-model="pageLink"
          placeholder="https://e-hentai.org/..."
          class="w-full !p-2"
        />
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Fetch Settings</div>
      <div class="p-4 flex flex-col gap-5">
        <div class="flex gap-8 items-center">
          <span class="text-xs text-eh-muted font-bold uppercase">Page:</span>
          <div class="flex items-center gap-2">
            <span class="text-xs">From:</span>
            <InputText v-model="fromPage" size="small" class="!w-16 !p-1 text-center" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs">To:</span>
            <InputText v-model="toPage" size="small" class="!w-16 !p-1 text-center" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-4 border-t border-eh-border">
      <Button
        label="Start Fetching List"
        icon="pi pi-play"
        class="w-full !bg-eh-border !border-eh-border !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleStartFetch"
      />
    </div>
  </div>
</template>
