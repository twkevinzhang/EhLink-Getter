import { ref, toRaw, watch, type Ref, type UnwrapRef } from "vue";

/**
 * Custom composable for electron-store persistence using VueUse-like pattern
 * Note: Due to async nature of IPC, this handles initial load and subsequent watches.
 */
export function useElectronStorage<T>(
  key: string,
  initialValue: T,
): Ref<UnwrapRef<T>> {
  const data = ref<T>(initialValue);
  const isLoaded = ref(false);

  // Load initial data
  const load = async () => {
    if (window.api?.storeGet) {
      const saved = await window.api.storeGet(key);
      if (saved !== undefined && saved !== null) {
        data.value = saved;
      }
      isLoaded.value = true;
    }
  };

  load();

  // Watch for changes and save
  watch(
    data,
    (newValue) => {
      if (isLoaded.value && window.api?.storeSet) {
        window.api.storeSet(key, toRaw(newValue));
      }
    },
    { deep: true },
  );

  return data as Ref<UnwrapRef<T>>;
}
