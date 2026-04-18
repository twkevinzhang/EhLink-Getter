<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useConfigStore } from '@renderer/stores/config'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const configStore = useConfigStore()
const toast = useToast()
const confirm = useConfirm()

// Local refs for editing
const proxyPool = ref('')
const scanThreads = ref(3)
const downloadThreads = ref(5)
const localCookies = ref(configStore.config.cookies)

interface EhCookie {
  name: string
  value: string
}

const parsedCookies = computed((): EhCookie[] => {
  try {
    return JSON.parse(configStore.config.cookies || '[]')
  } catch (e) {
    return []
  }
})

const isLoggedIn = computed(() => {
  return parsedCookies.value.some((c) => c.name === 'ipb_member_id' && c.value)
})

const memberId = computed(() => {
  const cookie = parsedCookies.value.find((c) => c.name === 'ipb_member_id')
  return cookie ? cookie.value : null
})

const syncLocalState = () => {
  proxyPool.value = (configStore.config.proxies || []).join('\n')
  scanThreads.value = configStore.config.scan_thread_cnt || 3
  downloadThreads.value = configStore.config.download_thread_cnt || 5
}

onMounted(() => {
  syncLocalState()
})

watch(
  () => configStore.config,
  () => {
    if (!isModified.value) {
      syncLocalState()
    }
  },
  { deep: true },
)

// 當 store cookies 被外部更新時（例如登入後），同步到本地
watch(
  () => configStore.config.cookies,
  (val) => {
    if (!isModified.value) localCookies.value = val
  },
)

const isModified = computed(() => {
  const currentProxies = proxyPool.value
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)

  const storeProxies = [...(configStore.config.proxies || [])]
  return (
    JSON.stringify(currentProxies) !== JSON.stringify(storeProxies) ||
    scanThreads.value !== (configStore.config.scan_thread_cnt || 3) ||
    downloadThreads.value !== (configStore.config.download_thread_cnt || 5) ||
    localCookies.value !== configStore.config.cookies
  )
})

const handleSave = () => {
  configStore.updateConfig({
    proxies: proxyPool.value
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    scan_thread_cnt: scanThreads.value,
    download_thread_cnt: downloadThreads.value,
    cookies: localCookies.value,
  })
  toast.add({
    severity: 'success',
    summary: 'Saved',
    detail: 'Settings saved and synced to backend',
    life: 3000,
  })
}

const handleLogin = async () => {
  try {
    const result = await configStore.loginEHentai()
    if (result.success && result.cookies) {
      configStore.updateConfig({ cookies: result.cookies })
      toast.add({
        severity: 'success',
        summary: 'Login Success',
        detail: 'Captured cookies and synced settings.',
        life: 3000,
      })
    } else if (result.error) {
      toast.add({
        severity: 'warn',
        summary: 'Login Warning',
        detail: result.error,
        life: 5000,
      })
    }
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Login Failed',
      detail: error instanceof Error ? error.message : String(error),
      life: 5000,
    })
  }
}

const handleLogout = () => {
  confirm.require({
    message: 'Are you sure you want to logout?',
    header: 'Logout Confirmation',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Logout',
    acceptClass: 'p-button-danger',
    accept: () => {
      configStore.updateConfig({ cookies: '' })
      toast.add({
        severity: 'success',
        summary: 'Logged Out',
        detail: 'Successfully logged out',
        life: 3000,
      })
    },
  })
}
</script>

<template>
  <div class="p-4 flex flex-col gap-6 overflow-y-auto h-full">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Core Configuration</div>
      <div class="p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between mt-2">
          <label class="text-xs text-eh-muted font-bold uppercase">Cookies </label>
          <Button
            v-if="!isLoggedIn"
            label="Login to E-Hentai"
            icon="pi pi-sign-in"
            text
            size="small"
            @click="handleLogin"
          />
          <Button
            v-else
            label="Logout"
            icon="pi pi-sign-out"
            severity="danger"
            text
            size="small"
            @click="handleLogout"
          />
        </div>

        <template v-if="isLoggedIn">
          <div
            class="mt-1 p-3 bg-eh-sidebar/50 border border-eh-border rounded flex items-center justify-between"
          >
            <div class="flex flex-col">
              <span class="text-xs text-eh-muted uppercase font-bold">Status</span>
              <span class="text-sm text-green-700 font-bold"
                >Logged in as ID: {{ memberId }}</span
              >
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span class="text-[10px] text-eh-muted uppercase">Session Active</span>
            </div>
          </div>
          <span class="text-[10px] text-eh-muted italic px-1 mt-1">
            Cookie tokens are securely stored. To update, please logout first.
          </span>
        </template>
        <template v-else>
          <span class="text-xs text-eh-muted">
            Format: [{"name": "ipp_pass_hash", ...}, ...]
          </span>
          <Textarea
            v-model="localCookies"
            class="w-full !p-2"
            rows="4"
            placeholder="JSON format cookies"
            autoResize
          />
        </template>
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Request Management</div>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-eh-muted font-bold uppercase"
            >Proxy Pool (one per line):</label
          >
          <Textarea
            v-model="proxyPool"
            rows="3"
            class="w-full !p-2"
            placeholder="socks5://127.0.0.1:1080"
          />
        </div>
        <div class="flex gap-10">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted font-bold uppercase">Scan Threads:</label>
            <InputNumber
              v-model="scanThreads"
              showButtons
              :min="1"
              :max="10"
              buttonLayout="horizontal"
              class="h-8"
              inputClass="!w-12 !h-8 !p-1 !text-center"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted font-bold uppercase"
              >Download Threads:</label
            >
            <InputNumber
              v-model="downloadThreads"
              showButtons
              :min="1"
              :max="20"
              buttonLayout="horizontal"
              class="h-8"
              inputClass="!w-12 !h-8 !p-1 !text-center"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-4 border-t border-eh-border mb-4">
      <Button
        :label="isModified ? 'Save Changes' : 'Up to date'"
        :disabled="!isModified"
        class="w-full !bg-eh-border !border-eh-border !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleSave"
      />
    </div>
  </div>
</template>
