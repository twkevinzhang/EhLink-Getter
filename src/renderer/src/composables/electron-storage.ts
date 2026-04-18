import { plainValue } from '@renderer/utilities'
import { ref, toRaw, watch, type Ref, type UnwrapRef } from 'vue'

/**
 * Custom composable for electron-store persistence using VueUse-like pattern
 * Note: Due to async nature of IPC, this handles initial load and subsequent watches.
 */
export function useElectronStorage<T>(key: string, initialValue: T): Ref<UnwrapRef<T>> {
  const data = ref<T>(initialValue)
  const isLoaded = ref(false)

  // Load initial data
  const load = async () => {
    if (window.api?.storeGet) {
      try {
        const saved = await window.api.storeGet(key)
        if (saved !== undefined && saved !== null) {
          data.value = saved
        }
      } catch (err) {
        console.error(`[ElectronStorage] Failed to load key "${key}":`, err)
      }
      isLoaded.value = true
    }
  }

  load()

  // Watch for changes and save
  watch(
    data,
    (newValue) => {
      if (isLoaded.value && window.api?.storeSet) {
        try {
          // Use JSON.parse(JSON.stringify()) to ensure the object is cloneable and free of Proxies/non-serializables
          window.api.storeSet(key, plainValue(newValue))
        } catch (err) {
          console.error(`[ElectronStorage] Failed to save key "${key}":`, err)
          console.error(`Value attempted to save:`, newValue)
        }
      }
    },
    { deep: true },
  )

  return data as Ref<UnwrapRef<T>>
}
