import { plainValue } from '@renderer/utilities'
import { ref, watch, type Ref, type UnwrapRef } from 'vue'

/**
 * Custom composable for electron-store persistence using VueUse-like pattern.
 * Uses isSaving flag to prevent the load completing from triggering a redundant write-back.
 */
export function useElectronStorage<T>(key: string, initialValue: T): Ref<UnwrapRef<T>> {
  const data = ref<T>(initialValue)
  let isLoaded = false
  let isSaving = false

  const load = async () => {
    if (!window.api?.storeGet) return
    try {
      const saved = await window.api.storeGet<T>(key)
      if (saved !== undefined && saved !== null) {
        isSaving = true
        data.value = saved as UnwrapRef<T>
        isSaving = false
      }
    } catch (err) {
      console.error(`[ElectronStorage] Failed to load key "${key}":`, err)
    }
    isLoaded = true
  }

  load()

  watch(
    data,
    (newValue) => {
      if (!isLoaded || isSaving || !window.api?.storeSet) return
      try {
        window.api.storeSet(key, plainValue(newValue))
      } catch (err) {
        console.error(`[ElectronStorage] Failed to save key "${key}":`, err)
      }
    },
    { deep: true },
  )

  return data as Ref<UnwrapRef<T>>
}
