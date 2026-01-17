<script setup lang="ts">
import { ref } from "vue";
import { Search } from "@element-plus/icons-vue";

const searchQuery = ref("");
const searchResults = ref<{ title: string; link: string }[]>([]);

const openLink = (url: string) => {
  window.electron.ipcRenderer.send("open-external", url);
};

const handleSearch = async () => {
  if (!searchQuery.value) return;
  const res = await window.api.searchMetadata(searchQuery.value);
  if (res && res.results) {
    searchResults.value = res.results;
  }
};
</script>

<template>
  <div class="tab-pane">
    <div class="mb-8">
      <h1
        class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
      >
        Search Metadata
      </h1>
      <p class="text-text-muted mt-2">Deep search in local metadata index</p>
    </div>

    <el-card class="glass-card mb-6">
      <el-input
        v-model="searchQuery"
        placeholder="Enter search keywords..."
        class="!bg-black/5"
        @keyup.enter="handleSearch"
      >
        <template #prefix
          ><el-icon><Search /></el-icon
        ></template>
        <template #append
          ><el-button @click="handleSearch">Search</el-button></template
        >
      </el-input>
    </el-card>

    <div
      class="mt-5 flex flex-col gap-3 max-h-[500px] overflow-y-auto"
      v-if="searchResults.length > 0"
    >
      <el-card
        v-for="(item, idx) in searchResults"
        :key="idx"
        class="glass-card !p-4 flex justify-between items-center"
      >
        <div class="flex-1">
          <div class="font-semibold mb-1">{{ item.title }}</div>
          <div class="text-[0.8rem] text-text-muted">{{ item.link }}</div>
        </div>
        <el-button
          type="primary"
          plain
          size="small"
          @click="openLink(item.link)"
          >Open</el-button
        >
      </el-card>
    </div>
    <el-empty v-else-if="searchQuery" description="No results found" />
  </div>
</template>
