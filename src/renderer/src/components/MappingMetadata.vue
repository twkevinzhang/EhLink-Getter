<script setup lang="ts">
import { ref, toRaw } from "vue";
import { ElMessage } from "element-plus";
import { CaretRight } from "@element-plus/icons-vue";

const mapKeywords = ref("");
const mapMetadataPath = ref("metadata.json");
const mapFields = ref(["title", "link"]);
const mapResults = ref<any[]>([]);
const mapLoading = ref(false);

const openLink = (url: string) => {
  window.electron.ipcRenderer.send("open-external", url);
};

const handleMetadataMap = async () => {
  if (!mapKeywords.value.trim()) {
    ElMessage.warning("Please enter at least one keyword");
    return;
  }
  mapLoading.value = true;
  try {
    const keywords = mapKeywords.value
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k);
    const res = await window.api.mapMetadata({
      keywords,
      metadata_path: toRaw(mapMetadataPath.value),
      fields: toRaw(mapFields.value),
    });

    if (res && res.results) {
      mapResults.value = res.results;
      ElMessage.success(`Mapped ${res.results.length} results`);
    } else if (res && res.error) {
      ElMessage.error(res.error);
    }
  } catch (error: any) {
    ElMessage.error(error.message || "Request failed");
  } finally {
    mapLoading.value = false;
  }
};
</script>

<template>
  <div class="tab-pane">
    <div class="mb-8">
      <h1
        class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
      >
        Mapping Metadata
      </h1>
      <p class="text-text-muted mt-2">Bulk find links by title keywords</p>
    </div>

    <el-card class="glass-card !p-5">
      <el-form label-position="top">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="Title Keywords (one per line)">
              <el-input
                v-model="mapKeywords"
                type="textarea"
                :rows="8"
                placeholder="Input titles here..."
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Metadata JSON Path">
              <el-input v-model="mapMetadataPath" placeholder="metadata.json" />
            </el-form-item>
            <el-form-item label="Output Fields">
              <el-select
                v-model="mapFields"
                multiple
                placeholder="Select fields"
                style="width: 100%"
              >
                <el-option label="Title" value="title" />
                <el-option label="Link" value="link" />
                <el-option label="GID" value="gid" />
                <el-option label="Token" value="token" />
              </el-select>
            </el-form-item>
            <div class="mt-5 flex justify-end">
              <el-button
                type="primary"
                size="large"
                :loading="mapLoading"
                @click="handleMetadataMap"
                icon="CaretRight"
                >Start Mapping</el-button
              >
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <div class="mt-10" v-if="mapResults.length > 0">
      <div class="flex justify-between items-center mb-4">
        <h3 class="m-0">Mapping Results ({{ mapResults.length }})</h3>
        <el-button size="small" @click="mapResults = []">Clear</el-button>
      </div>
      <el-table
        :data="mapResults"
        style="width: 100%"
        height="400"
        class="glass-table"
      >
        <el-table-column
          v-for="field in mapFields"
          :key="field"
          :prop="field"
          :label="field"
          show-overflow-tooltip
        >
          <template #default="scope">
            <el-link
              v-if="field === 'link'"
              type="primary"
              @click="openLink(scope.row[field])"
            >
              {{ scope.row[field] }}
            </el-link>
            <span v-else>{{ scope.row[field] }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
