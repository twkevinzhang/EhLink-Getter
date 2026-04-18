<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useConfigStore } from '../../stores/config'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Position, SwitchButton } from '@element-plus/icons-vue'

const configStore = useConfigStore()

// Local refs for editing
const metadataPath = ref('')
const storageStrategy = ref<'eh_id' | 'traditional'>('traditional')
const proxyPool = ref('')
const scanThreads = ref(3)
const downloadThreads = ref(5)
const cookies = ref('')

// Computed based directly on store for SSOT
const parsedCookies = computed(() => {
  try {
    return JSON.parse(configStore.config.cookies || '[]')
  } catch (e) {
    return []
  }
})

const isLoggedIn = computed(() => {
  return parsedCookies.value.some((c: any) => c.name === 'ipb_member_id' && c.value)
})

const memberId = computed(() => {
  const cookie = parsedCookies.value.find((c: any) => c.name === 'ipb_member_id')
  return cookie ? cookie.value : null
})

const syncLocalState = () => {
  storageStrategy.value = configStore.config.storage_strategy || 'traditional'
  proxyPool.value = (configStore.config.proxies || []).join('\n')
  scanThreads.value = configStore.config.scan_thread_cnt || 3
  downloadThreads.value = configStore.config.download_thread_cnt || 5
  cookies.value = configStore.config.cookies || ''
}

// Initial sync
onMounted(() => {
  syncLocalState()
})

// Watch for store changes (like after initialization or external updates)
// but only sync if the local state hasn't been modified by user yet, 
// OR simply sync once when config is loaded.
watch(() => configStore.config, () => {
  // If the user is currently looking at the settings, we should be careful 
  // about overwriting their typing. However, during app init, this is necessary.
  // We check isModified - if NOT modified, it's safe to sync from store.
  if (!isModified.value) {
    syncLocalState()
  }
}, { deep: true })

const isModified = computed(() => {
  const currentProxies = proxyPool.value
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const storeProxies = [...(configStore.config.proxies || [])]

  // IMPORTANT: Ensure consistency with syncLocalState defaults
  const storeStrategy = configStore.config.storage_strategy || 'traditional'
  const storeScanThreads = configStore.config.scan_thread_cnt || 3
  const storeDownloadThreads = configStore.config.download_thread_cnt || 5

  return (
    storageStrategy.value !== storeStrategy ||
    JSON.stringify(currentProxies) !== JSON.stringify(storeProxies) ||
    scanThreads.value !== storeScanThreads ||
    downloadThreads.value !== storeDownloadThreads
  )
})

const handleSave = () => {
  const newConfig = {
    storage_strategy: storageStrategy.value,
    proxies: proxyPool.value
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    scan_thread_cnt: scanThreads.value,
    download_thread_cnt: downloadThreads.value,
    cookies: configStore.config.cookies, // Use store value
    download_path: configStore.config.download_path, // Keep existing
  }

  configStore.updateConfig(newConfig)
  ElMessage.success('Settings saved and synced to backend')
}

const handleLogin = async () => {
  try {
    const result = await window.api.loginEHentai()
    if (result.success && result.cookies) {
      // Sync immediately to store (and thus localStorage)
      configStore.updateConfig({ ...configStore.config, cookies: result.cookies })
      ElMessage.success('Successfully logged in and captured cookies. Settings synced.')
    } else if (result.error) {
      ElMessage.warning(result.error)
    }
  } catch (error: any) {
    ElMessage.error(`Login failed: ${error.message}`)
  }
}

const handleLogout = () => {
  ElMessageBox.confirm('Are you sure you want to logout?', 'Warning', {
    confirmButtonText: 'Logout',
    cancelButtonText: 'Cancel',
    type: 'warning',
  })
    .then(() => {
      cookies.value = ''
      // Sync immediately to store (and thus localStorage)
      configStore.updateConfig({ ...configStore.config, cookies: '' })
      ElMessage.success('Logged out successfully')
    })
    .catch(() => {})
}
</script>

<template>
  <div class="p-4 flex flex-col gap-6 overflow-y-auto h-full">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Core Configuration</div>
      <div class="p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between mt-2">
          <label class="text-xs text-eh-muted font-bold uppercase">Cookies </label>
          <el-button
            v-if="!isLoggedIn"
            type="primary"
            link
            size="small"
            @click="handleLogin"
          >
            <el-icon class="mr-1"><Position /></el-icon>
            Login to E-Hentai
          </el-button>
          <el-button v-else type="danger" link size="small" @click="handleLogout">
            <el-icon class="mr-1"><SwitchButton /></el-icon>
            Logout
          </el-button>
        </div>

        <template v-if="isLoggedIn">
          <div
            class="mt-1 p-3 bg-eh-surface-hover border border-eh-border rounded flex items-center justify-between"
          >
            <div class="flex flex-col">
              <span class="text-xs text-eh-muted uppercase font-bold">Status</span>
              <span class="text-sm text-green-400 font-bold"
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
            like [{"name": "ipb_pass_hash", "domain": ".e-hentai.org", ...}, ...]
          </span>
          <el-input
            class="border border-eh-border"
            :modelValue="configStore.config.cookies"
            type="textarea"
            :rows="4"
            placeholder="For ExHentai access"
            @update:modelValue="
              (val: any) =>
                configStore.updateConfig({ ...configStore.config, cookies: val })
            "
          />
        </template>
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Storage Strategy</div>
      <div class="p-4 flex flex-col gap-3">
        <el-radio-group v-model="storageStrategy">
          <el-radio value="eh_id">EH_ID Strategy</el-radio>
          <el-radio value="traditional">Traditional</el-radio>
        </el-radio-group>

        <div
          class="mt-2 p-3 bg-eh-surface/50 border border-eh-border/30 rounded text-xs leading-relaxed transition-all"
        >
          <template v-if="storageStrategy === 'eh_id'">
            <div class="text-eh-accent font-bold mb-1">EH_ID Strategy</div>
            <p class="text-eh-text/90 mb-2">
              <span class="font-bold">ZH:</span>
              EH_ID 優先策略。檔案將直接以畫廊 ID 命名（如
              /123456），並可選用哈希分層，適合大規模收藏與自動化管理。
            </p>
            <p class="text-eh-muted italic">
              <span class="font-bold">EN:</span> EH_ID-based strategy. Files are named
              directly by Gallery ID (e.g., /123456/), supporting hashed subdirectories to
              ensure filesystem stability for massive collections.
            </p>
          </template>
          <template v-else>
            <div class="text-eh-accent font-bold mb-1">Traditional</div>
            <p class="text-eh-text/90 mb-2">
              <span class="font-bold">ZH:</span>
              傳統平鋪策略。畫廊直接存放於下載根目錄，資料夾名稱即為標題，方便直接透過檔案瀏覽器手動尋找與管理。
            </p>
            <p class="text-eh-muted italic">
              <span class="font-bold">EN:</span> Traditional strategy. Galleries are
              stored directly in the root download directory with their titles as folder
              names. Convenient for manual browsing and management via file explorer.
            </p>
          </template>
        </div>
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Request Management</div>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-eh-muted font-bold uppercase"
            >Proxy Pool (one per line):</label
          >
          <el-input
            v-model="proxyPool"
            type="textarea"
            :rows="3"
            placeholder="socks5://127.0.0.1:1080"
          />
        </div>
        <div class="flex gap-10">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted font-bold uppercase">Scan Threads:</label>
            <el-input-number v-model="scanThreads" :min="1" :max="10" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted font-bold uppercase"
              >Download Threads:</label
            >
            <el-input-number v-model="downloadThreads" :min="1" :max="20" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-4 border-t border-eh-border mb-4">
      <el-button
        type="primary"
        class="w-full !rounded-none !h-10 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!isModified"
        @click="handleSave"
      >
        {{ isModified ? 'Save Changes' : 'Up to date' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* Scoped overrides */
</style>
