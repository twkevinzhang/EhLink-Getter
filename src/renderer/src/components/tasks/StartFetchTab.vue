<script setup lang="ts">
import { ref } from "vue";
import { CaretRight } from "@element-plus/icons-vue";

const pageLink = ref("https://e-hentai.org/favorites.php");
const fromPage = ref(1);
const toPage = ref("All");
const metaPath = ref("C:/Path/meta.json");
</script>

<template>
  <div class="p-4 flex flex-col gap-6">
    <div class="section">
      <div class="font-bold mb-2">Page / Search Link</div>
      <el-input v-model="pageLink" placeholder="https://e-hentai.org/..." />
    </div>

    <div class="section">
      <div class="font-bold mb-2">Fetch Settings</div>
      <div class="flex flex-col gap-4">
        <div class="flex gap-4 items-center">
          <span class="text-xs text-eh-muted">Download Range:</span>
          <div class="flex items-center gap-2">
            <span class="text-xs">From:</span>
            <el-input v-model="fromPage" size="small" class="w-16" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs">To:</span>
            <el-input v-model="toPage" size="small" class="w-16" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-eh-muted">Meta DB:</label>
          <div class="flex gap-2">
            <el-input v-model="metaPath" class="flex-1" />
            <el-button small>Browse</el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <el-button
        type="primary"
        class="w-full flex items-center justify-center gap-2"
      >
        <el-icon><CaretRight /></el-icon>
        Start Fetching List
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.section {
  @apply border-b border-eh-border pb-4;
}
</style>
