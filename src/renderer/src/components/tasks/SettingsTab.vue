<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useConfigStore } from "../../stores/config";
import { ElMessage, ElMessageBox } from "element-plus";
import { Position, SwitchButton } from "@element-plus/icons-vue";

const configStore = useConfigStore();

// Local refs for editing
const metadataPath = ref("");
const storageStrategy = ref<"logical" | "traditional">("logical");
const proxyPool = ref("");
const scanThreads = ref(3);
const downloadThreads = ref(5);
const cookies = ref("");

// Computed based directly on store for SSOT
const parsedCookies = computed(() => {
  try {
    return JSON.parse(configStore.config.cookies || "[]");
  } catch (e) {
    return [];
  }
});

const isLoggedIn = computed(() => {
  return parsedCookies.value.some(
    (c: any) => c.name === "ipb_member_id" && c.value,
  );
});

const memberId = computed(() => {
  const cookie = parsedCookies.value.find((c: any) => c.name === "ipb_member_id");
  return cookie ? cookie.value : null;
});

onMounted(() => {
  // Initialize from store
  storageStrategy.value = configStore.config.storage_strategy;
  proxyPool.value = configStore.config.proxies.join("\n");
  scanThreads.value = configStore.config.scan_thread_cnt;
  downloadThreads.value = configStore.config.download_thread_cnt;
  cookies.value = configStore.config.cookies || "";
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
    cookies: configStore.config.cookies, // Use store value
    download_path: configStore.config.download_path, // Keep existing
  };

  configStore.updateConfig(newConfig);
  ElMessage.success("Settings saved and synced to backend");
};

const handleLogin = async () => {
  try {
    const result = await window.api.loginEHentai();
    if (result.success && result.cookies) {
      // Sync immediately to store (and thus localStorage)
      configStore.updateConfig({ ...configStore.config, cookies: result.cookies });
      ElMessage.success(
        "Successfully logged in and captured cookies. Settings synced.",
      );
    } else if (result.error) {
      ElMessage.warning(result.error);
    }
  } catch (error: any) {
    ElMessage.error(`Login failed: ${error.message}`);
  }
};

const handleLogout = () => {
  ElMessageBox.confirm("Are you sure you want to logout?", "Warning", {
    confirmButtonText: "Logout",
    cancelButtonText: "Cancel",
    type: "warning",
  })
    .then(() => {
      cookies.value = "";
      // Sync immediately to store (and thus localStorage)
      configStore.updateConfig({ ...configStore.config, cookies: "" });
      ElMessage.success("Logged out successfully");
    })
    .catch(() => {});
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 overflow-y-auto h-full">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Core Configuration</div>
      <div class="p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between mt-2">
          <label class="text-xs text-eh-muted font-bold uppercase"
            >Cookies
          </label>
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
          <el-button
            v-else
            type="danger"
            link
            size="small"
            @click="handleLogout"
          >
            <el-icon class="mr-1"><SwitchButton /></el-icon>
            Logout
          </el-button>
        </div>

        <template v-if="isLoggedIn">
          <div
            class="mt-1 p-3 bg-eh-surface-hover border border-eh-border rounded flex items-center justify-between"
          >
            <div class="flex flex-col">
              <span class="text-xs text-eh-muted uppercase font-bold"
                >Status</span
              >
              <span class="text-sm text-green-400 font-bold"
                >Logged in as ID: {{ memberId }}</span
              >
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span class="text-[10px] text-eh-muted uppercase"
                >Session Active</span
              >
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
            :model-value="configStore.config.cookies"
            @update:model-value="(val) => configStore.updateConfig({ ...configStore.config, cookies: val })"
            type="textarea"
            :rows="4"
            placeholder="For ExHentai access"
          />
        </template>
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
