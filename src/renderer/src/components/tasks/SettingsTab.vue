<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAppStore } from "../../stores/app";
import { ElMessage } from "element-plus";

const store = useAppStore();

// Local refs for editing
const metadataPath = ref("");
const storageStrategy = ref<"logical" | "traditional">("logical");
const proxyPool = ref("");
const scanThreads = ref(3);
const downloadThreads = ref(5);
const cookies = ref("");

onMounted(() => {
  // Initialize from store
  storageStrategy.value = store.config.storage_strategy;
  proxyPool.value = store.config.proxies.join("\n");
  scanThreads.value = store.config.scan_thread_cnt;
  downloadThreads.value = store.config.download_thread_cnt;
  cookies.value = store.config.cookies || "";
});

const handleSave = () => {
  const newConfig = {
    storage_strategy: storageStrategy.value,
    proxies: proxyPool.value
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    scan_thread_cnt: scanThreads.value,
    download_thread_cnt: downloadThreads.value,
    cookies: cookies.value,
    download_path: store.config.download_path, // Keep existing
  };

  store.updateConfig(newConfig);
  ElMessage.success("Settings saved and synced to backend");
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 overflow-y-auto h-full">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Core Configuration</div>
      <div class="p-4 flex flex-col gap-3">
        <label class="text-xs text-eh-muted font-bold uppercase mt-2"
          >Cookies
        </label>
        <span class="text-xs text-eh-muted">
          like [{"name": "ipb_pass_hash", "domain": ".e-hentai.org", ...}, ...]
        </span>
        <el-input
          class="border border-eh-border"
          v-model="cookies"
          type="textarea"
          :rows="4"
          placeholder="For ExHentai access"
        />
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Storage Strategy</div>
      <div class="p-4">
        <el-radio-group v-model="storageStrategy">
          <el-radio value="logical">Logical (Hashed)</el-radio>
          <el-radio value="traditional">Traditional (Flat)</el-radio>
        </el-radio-group>
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
            <label class="text-xs text-eh-muted font-bold uppercase"
              >Scan Threads:</label
            >
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
        class="w-full !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleSave"
        >Save Changes</el-button
      >
    </div>
  </div>
</template>

<style scoped>
/* Scoped overrides */
</style>
