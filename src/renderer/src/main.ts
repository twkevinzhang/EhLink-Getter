import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "./assets/tailwind.css";
import App from "./App.vue";

console.log("[Renderer] Starting Vue application initialization...");

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);

console.log("[Renderer] Mounting Vue application to #app...");
app.mount("#app");
console.log("[Renderer] Vue application mounted successfully!");
