import * as fs from "fs";
import * as readline from "readline";

export class MetadataService {
  private metadataPath: string;

  constructor(metadataPath: string) {
    this.metadataPath = metadataPath;
  }

  async findLinks(titleQuery: string, limit = 10): Promise<any[]> {
    return this.findMultipleLinks([titleQuery], limit, false);
  }

  async findMultipleLinks(
    queries: string[],
    limit = 1000,
    raw = false
  ): Promise<any[]> {
    if (!fs.existsSync(this.metadataPath)) {
      throw new Error(`Metadata file not found: ${this.metadataPath}`);
    }

    const results: any[] = [];
    const normalizedQueries = queries
      .map((q) => q.trim().toLowerCase())
      .filter((q) => q.length > 0);

    if (normalizedQueries.length === 0) return [];

    const fileStream = fs.createReadStream(this.metadataPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        const meta = JSON.parse(line);
        const titleLower = (meta.title || "").toLowerCase();

        const isMatch = normalizedQueries.some((q) => titleLower.includes(q));

        if (isMatch) {
          if (raw) {
            results.push(meta);
          } else {
            results.push({
              title: meta.title,
              link: `https://e-hentai.org/g/${meta.gid}/${meta.token}/`,
            });
          }

          if (results.length >= limit) {
            rl.close();
            break;
          }
        }
      } catch (e) {
        // Skip malformed lines
      }
    }

    return results;
  }
}
