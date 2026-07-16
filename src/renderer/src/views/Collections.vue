<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import {
  useAutomationStore,
  type GalleryCollection,
  type ManagedGallery,
} from '@renderer/stores/automation'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const UNCATEGORIZED = '__uncategorized__'
const automation = useAutomationStore()
const workspace = useWorkspaceStore()
const confirm = useConfirm()
const toast = useToast()

const selectedId = ref(UNCATEGORIZED)
const selectedGids = ref<string[]>([])
const search = ref('')
const nameDialogVisible = ref(false)
const editingCollection = ref<GalleryCollection>()
const collectionName = ref('')
const nameError = ref('')
const savingName = ref(false)
const assignDialogVisible = ref(false)
const targetCollectionIds = ref<string[]>([])
const assigning = ref(false)

const selectedCollection = computed(() =>
  automation.collections.find(
    (collection) => collection.collectionId === selectedId.value,
  ),
)

const selectedCollectionName = computed(() =>
  selectedId.value === UNCATEGORIZED
    ? '未分類'
    : selectedCollection.value?.name || 'Collection',
)

const selectedCollectionGalleries = computed(() => {
  if (selectedId.value === UNCATEGORIZED) return automation.uncategorizedGalleries
  if (!selectedCollection.value) return []
  const gids = new Set(selectedCollection.value.books.map((entry) => entry.gid))
  return automation.galleries.filter((gallery) => gids.has(gallery.gid))
})

const visibleGalleries = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return selectedCollectionGalleries.value
  return selectedCollectionGalleries.value.filter(
    (gallery) =>
      gallery.gid.includes(query) || gallery.title.toLocaleLowerCase().includes(query),
  )
})

const selectedAll = computed(
  () =>
    visibleGalleries.value.length > 0 &&
    visibleGalleries.value.every((gallery) => selectedGids.value.includes(gallery.gid)),
)

watch(selectedId, () => {
  selectedGids.value = []
  search.value = ''
})

onMounted(() => {
  if (workspace.configured) void automation.load()
})

function toggleGallery(gid: string) {
  selectedGids.value = selectedGids.value.includes(gid)
    ? selectedGids.value.filter((candidate) => candidate !== gid)
    : [...selectedGids.value, gid]
}

function toggleAll() {
  const visibleIds = visibleGalleries.value.map((gallery) => gallery.gid)
  if (selectedAll.value) {
    const visibleSet = new Set(visibleIds)
    selectedGids.value = selectedGids.value.filter((gid) => !visibleSet.has(gid))
  } else {
    selectedGids.value = [...new Set([...selectedGids.value, ...visibleIds])]
  }
}

function openCreate() {
  editingCollection.value = undefined
  collectionName.value = ''
  nameError.value = ''
  nameDialogVisible.value = true
}

function openRename() {
  if (!selectedCollection.value) return
  editingCollection.value = selectedCollection.value
  collectionName.value = selectedCollection.value.name
  nameError.value = ''
  nameDialogVisible.value = true
}

async function saveName() {
  const name = collectionName.value.trim()
  if (!name) {
    nameError.value = '請輸入 Collection 名稱'
    return
  }
  savingName.value = true
  nameError.value = ''
  try {
    const saved = editingCollection.value
      ? await automation.updateCollection(editingCollection.value.collectionId, name)
      : await automation.createCollection(name)
    selectedId.value = saved.collectionId
    nameDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: '已儲存',
      detail: `Collection「${name}」已更新`,
      life: 2500,
    })
  } catch (reason) {
    nameError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    savingName.value = false
  }
}

function confirmDelete() {
  const collection = selectedCollection.value
  if (!collection) return
  confirm.require({
    header: '刪除 Collection？',
    message: `「${collection.name}」中的 Gallery 不會被刪除；沒有其他分類的 Gallery 將回到「未分類」。`,
    rejectLabel: '取消',
    acceptLabel: '刪除 Collection',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      await automation.deleteCollection(collection.collectionId)
      selectedId.value = UNCATEGORIZED
      toast.add({
        severity: 'success',
        summary: '已刪除',
        detail: collection.name,
        life: 2500,
      })
    },
  })
}

function openAssign(gallery?: ManagedGallery) {
  if (gallery) selectedGids.value = [gallery.gid]
  targetCollectionIds.value = []
  assignDialogVisible.value = true
}

async function assignCollections() {
  if (!selectedGids.value.length || !targetCollectionIds.value.length) return
  assigning.value = true
  try {
    await automation.addToCollections(selectedGids.value, targetCollectionIds.value)
    assignDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: '已加入 Collection',
      detail: `${selectedGids.value.length} 本 Gallery 已更新`,
      life: 2500,
    })
    selectedGids.value = []
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: '更新失敗',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
  } finally {
    assigning.value = false
  }
}

async function removeSelected() {
  const collection = selectedCollection.value
  if (!collection || !selectedGids.value.length) return
  try {
    await automation.removeManyFromCollection(selectedGids.value, collection.collectionId)
    toast.add({
      severity: 'success',
      summary: '已移出 Collection',
      detail: `${selectedGids.value.length} 本 Gallery 已更新`,
      life: 2500,
    })
    selectedGids.value = []
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: '更新失敗',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
  }
}

function statusSeverity(status: ManagedGallery['status']) {
  if (status === 'completed') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'downloading') return 'info'
  return 'secondary'
}
</script>

<template>
  <div class="flex h-full min-w-0 overflow-hidden bg-eh-bg">
    <aside
      class="flex w-[290px] shrink-0 flex-col border-r border-eh-border bg-eh-sidebar max-[899px]:w-[76px]"
      aria-label="Collections 清單"
    >
      <div
        class="flex h-[72px] items-center justify-between gap-2 border-b border-eh-border px-4 max-[899px]:px-3"
      >
        <div class="min-w-0 max-[899px]:hidden">
          <h1 class="font-bold text-eh-text">Collections</h1>
          <p class="mt-1 text-xs text-eh-muted">一個 Gallery 可加入多個集合</p>
        </div>
        <Button
          icon="pi pi-plus"
          aria-label="新增 Collection"
          title="新增 Collection"
          @click="openCreate"
        />
      </div>

      <div class="flex-1 space-y-1 overflow-y-auto p-2">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors"
          :class="
            selectedId === UNCATEGORIZED
              ? 'border-eh-border bg-eh-panel text-eh-text shadow-sm'
              : 'border-transparent text-eh-muted hover:bg-eh-panel/70'
          "
          title="未分類"
          @click="selectedId = UNCATEGORIZED"
        >
          <i class="pi pi-inbox w-4 shrink-0 text-center"></i>
          <span class="min-w-0 flex-1 max-[899px]:hidden">
            <span class="block font-semibold">未分類</span>
            <small>動態分類</small>
          </span>
          <span class="text-xs tabular-nums max-[899px]:hidden">{{
            automation.uncategorizedGalleries.length
          }}</span>
        </button>

        <div class="mx-2 my-2 border-t border-eh-border/20"></div>

        <button
          v-for="collection in automation.sortedCollections"
          :key="collection.collectionId"
          type="button"
          class="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors"
          :class="
            selectedId === collection.collectionId
              ? 'border-eh-border bg-eh-panel text-eh-text shadow-sm'
              : 'border-transparent text-eh-muted hover:bg-eh-panel/70'
          "
          :title="collection.name"
          @click="selectedId = collection.collectionId"
        >
          <i class="pi pi-folder w-4 shrink-0 text-center"></i>
          <span class="min-w-0 flex-1 truncate font-semibold max-[899px]:hidden">{{
            collection.name
          }}</span>
          <span class="text-xs tabular-nums max-[899px]:hidden">{{
            collection.books.length
          }}</span>
        </button>
      </div>
    </aside>

    <main class="min-w-0 flex-1 overflow-y-auto p-5 lg:p-7">
      <div class="mx-auto flex max-w-[1500px] flex-col gap-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-eh-accent">
              Collection
            </p>
            <h2 class="mt-1 text-2xl font-bold text-eh-text">
              {{ selectedCollectionName }}
            </h2>
            <p class="mt-1 text-xs text-eh-muted">
              {{ selectedCollectionGalleries.length }} 本 Gallery
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="selectedCollection"
              label="重新命名"
              icon="pi pi-pencil"
              outlined
              @click="openRename"
            />
            <Button
              v-if="selectedCollection"
              icon="pi pi-trash"
              severity="danger"
              outlined
              aria-label="刪除 Collection"
              title="刪除 Collection"
              @click="confirmDelete"
            />
          </div>
        </div>

        <div
          class="flex flex-wrap items-center gap-3 rounded-lg border border-eh-border/20 bg-eh-panel p-3"
        >
          <InputText
            v-model="search"
            placeholder="搜尋標題或 GID"
            class="min-w-[13rem] flex-1"
          />
          <label
            class="flex cursor-pointer items-center gap-2 text-xs font-bold text-eh-text"
          >
            <Checkbox :modelValue="selectedAll" binary @change="toggleAll" />
            全選
          </label>
          <span v-if="selectedGids.length" class="text-xs text-eh-muted"
            >已選 {{ selectedGids.length }} 本</span
          >
          <Button
            label="加入 Collections"
            icon="pi pi-folder-plus"
            :disabled="selectedGids.length === 0 || automation.collections.length === 0"
            @click="openAssign()"
          />
          <Button
            v-if="selectedCollection"
            label="移出目前 Collection"
            icon="pi pi-times"
            severity="danger"
            outlined
            :disabled="selectedGids.length === 0"
            @click="removeSelected"
          />
        </div>

        <div
          v-if="automation.error"
          class="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {{ automation.error }}
        </div>

        <div v-if="visibleGalleries.length" class="gallery-grid">
          <article
            v-for="gallery in visibleGalleries"
            :key="gallery.gid"
            class="group relative overflow-hidden rounded-lg border bg-eh-panel transition-all hover:-translate-y-0.5 hover:shadow-lg"
            :class="
              selectedGids.includes(gallery.gid)
                ? 'border-eh-accent shadow-md'
                : 'border-eh-border/25 hover:border-eh-border'
            "
          >
            <button
              type="button"
              class="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md bg-black/65 text-white shadow backdrop-blur"
              :aria-label="
                selectedGids.includes(gallery.gid) ? '取消選取' : '選取 Gallery'
              "
              @click="toggleGallery(gallery.gid)"
            >
              <i
                :class="
                  selectedGids.includes(gallery.gid) ? 'pi pi-check' : 'pi pi-circle'
                "
                class="text-xs"
              ></i>
            </button>
            <div class="aspect-[3/2] overflow-hidden bg-eh-sidebar">
              <img
                v-if="gallery.thumb"
                :src="gallery.thumb"
                :alt="gallery.title"
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div v-else class="grid h-full place-items-center text-eh-border/40">
                <i class="pi pi-image text-3xl"></i>
              </div>
            </div>
            <div class="p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <span
                  class="rounded bg-eh-sidebar px-1.5 py-0.5 font-mono text-[9px] font-bold text-eh-text"
                  >GID {{ gallery.gid }}</span
                >
                <Tag
                  v-if="gallery.status"
                  :value="gallery.status"
                  :severity="statusSeverity(gallery.status)"
                  class="!text-[9px]"
                />
              </div>
              <h3
                class="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-eh-text"
              >
                {{ gallery.title }}
              </h3>
              <Button
                label="加入其他 Collection"
                icon="pi pi-folder-plus"
                text
                size="small"
                class="mt-2 !px-0 !text-xs"
                @click="openAssign(gallery)"
              />
            </div>
          </article>
        </div>

        <div
          v-else
          class="grid min-h-[22rem] place-items-center rounded-xl border-2 border-dashed border-eh-border/20 bg-eh-panel/35 p-8 text-center"
        >
          <div>
            <i class="pi pi-folder-open text-4xl text-eh-border/35"></i>
            <h3 class="mt-4 font-bold text-eh-text">這個 Collection 還沒有 Gallery</h3>
            <p class="mt-2 text-sm text-eh-muted">
              Gallery 開始下載後，才能加入 Collection。
            </p>
          </div>
        </div>
      </div>
    </main>

    <Dialog
      v-model:visible="nameDialogVisible"
      modal
      :header="editingCollection ? '重新命名 Collection' : '新增 Collection'"
      class="w-[min(28rem,calc(100vw-2rem))]"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveName">
        <label class="flex flex-col gap-2 text-sm font-bold text-eh-text">
          Collection 名稱
          <InputText v-model="collectionName" autofocus required />
        </label>
        <p
          v-if="nameError"
          class="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          {{ nameError }}
        </p>
        <div class="flex justify-end gap-2">
          <Button
            label="取消"
            severity="secondary"
            outlined
            type="button"
            @click="nameDialogVisible = false"
          />
          <Button label="儲存" type="submit" :loading="savingName" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="assignDialogVisible"
      modal
      header="加入 Collections"
      class="w-[min(32rem,calc(100vw-2rem))]"
    >
      <div class="flex flex-col gap-4">
        <p class="text-sm text-eh-muted">
          已選 {{ selectedGids.length }} 本 Gallery。既有 Collection 關聯會保留。
        </p>
        <MultiSelect
          v-model="targetCollectionIds"
          :options="automation.sortedCollections"
          optionLabel="name"
          optionValue="collectionId"
          display="chip"
          placeholder="選擇一個或多個 Collections"
          class="w-full"
        />
        <div class="flex justify-end gap-2">
          <Button
            label="取消"
            severity="secondary"
            outlined
            @click="assignDialogVisible = false"
          />
          <Button
            label="加入"
            :disabled="targetCollectionIds.length === 0"
            :loading="assigning"
            @click="assignCollections"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.line-clamp-2 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
