<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "../../stores/app";

const store = useAppStore();
const tasksPath = ref("C:/Path/tasks.json");
const storageStrategy = ref("logical");
const proxyPool = ref("socks5h://127.0.0.1:1080\nhttp://proxy:8080");
const scanThreads = ref(3);
const downloadThreads = ref(5);

const handleBrowse = async () => {
  const path = await window.api.selectDirectory();
  if (path) {
    tasksPath.value = path;
  }
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6">
    <div class="section">
      <div class="font-bold mb-2">Core Configuration</div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-eh-muted">tasks.json Path:</label>
        <div class="flex gap-2">
          <el-input v-model="tasksPath" class="flex-1" />
          <el-button small @click="handleBrowse">Browse</el-button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="font-bold mb-2">Storage Strategy</div>
      <el-radio-group v-model="storageStrategy">
        <el-radio value="logical">Logical (Hashed)</el-radio>
        <el-radio value="traditional">Traditional</el-radio>
      </el-radio-group>
    </div>

    <div class="section">
      <div class="font-bold mb-2">Request Management</div>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-eh-muted"
            >Proxy Pool (one per line):</label
          >
          <el-input
            v-model="proxyPool"
            type="textarea"
            :rows="3"
            placeholder="proto://host:port"
          />
        </div>
        <div class="flex gap-6">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted">Scan Threads:</label>
            <el-input-number v-model="scanThreads" :min="1" :max="10" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-eh-muted">Download Threads:</label>
            <el-input-number v-model="downloadThreads" :min="1" :max="20" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <el-button type="primary" class="w-full">Save Changes</el-button>
    </div>
  </div>
</template>

<style scoped>
.section {
  @apply border-b border-eh-border pb-4;
}
</style>
