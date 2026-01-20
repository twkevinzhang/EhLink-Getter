import { app } from "electron";
import * as fs from "fs";
import { join } from "path";

export interface AppConfig {
  cookies: string;
  proxies: string[];
  metadata_path: string;
  download_path: string;
  scan_thread_cnt: number;
  download_thread_cnt: number;
  storage_strategy: "logical" | "traditional";
}

const DEFAULT_CONFIG: AppConfig = {
  cookies: "",
  proxies: [],
  metadata_path: "metadata.json",
  download_path: "output",
  scan_thread_cnt: 3,
  download_thread_cnt: 5,
  storage_strategy: "logical",
};

export class ConfigService {
  private configPath: string;

  constructor() {
    this.configPath = join(app.getPath("userData"), "config.json");
  }

  loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(config: AppConfig): void {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(config, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }
}
