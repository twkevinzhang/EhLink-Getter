import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import { EHPreset } from './theme/preset'
import 'primeicons/primeicons.css'
import './assets/tailwind.css'
import App from './App.vue'

// Globally register components that often fail auto-import in v4
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'

console.log('[Renderer] Starting Vue application initialization...')

const app = createApp(App)
app.use(createPinia())
app.use(PrimeVue, {
  theme: {
    preset: EHPreset,
    options: {
      darkModeSelector: '.dark-mode'
    }
  }
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

// Register global components
app.component('Tabs', Tabs)
app.component('TabList', TabList)
app.component('Tab', Tab)
app.component('TabPanels', TabPanels)
app.component('TabPanel', TabPanel)
app.component('Toast', Toast)
app.component('ConfirmDialog', ConfirmDialog)
app.component('Button', Button)
app.component('ToggleSwitch', ToggleSwitch)

console.log("[Renderer] Mounting Vue application to #app...");
app.mount("#app");
console.log("[Renderer] Vue application mounted successfully!");
