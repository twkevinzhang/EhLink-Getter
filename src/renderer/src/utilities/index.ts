import { markRaw } from 'vue'

export function plainValue(value: any): any {
  return JSON.parse(JSON.stringify(markRaw(value)))
}
