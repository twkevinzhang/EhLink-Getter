<script setup lang="ts">
import { useAppStore } from "../stores/app";
import { ElMessage } from "element-plus";
import { Connection } from "@element-plus/icons-vue";

const store = useAppStore();

const saveConfig = async () => {
  const res = await window.api.saveConfig({ ...store.config });
  if (res.success) {
    ElMessage.success("Configuration saved");
  } else {
    ElMessage.error(res.error || "Unknown error");
  }
};
</script>

<template>
  <div class="tab-pane">
    <div class="mb-8">
      <h1
        class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
      >
        Configuration
      </h1>
      <p class="text-text-muted mt-2">Setup your credentials and paths</p>
    </div>

    <el-form :model="store.config" label-position="top" class="max-w-[800px]">
      <el-card class="glass-card mb-6">
        <template #header>
          <div class="flex items-center gap-2 font-semibold">
            <el-icon><Connection /></el-icon>
            <span>Network Configuration</span>
          </div>
        </template>
        <el-form-item label="Proxy (Optional)">
          <el-input
            v-model="store.config.proxy"
            placeholder="http://127.0.0.1:7890"
          />
        </el-form-item>
      </el-card>

      <div class="flex justify-start">
        <el-button
          type="primary"
          size="large"
          @click="saveConfig"
          class="w-[200px]"
          >Save Changes</el-button
        >
      </div>
    </el-form>
  </div>
</template>
