import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  HostJsonObjectSchema,
  SettingsUpdateInputSchema,
  type HostJsonObject,
} from "../../shared/desktop";

const SettingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  settings: HostJsonObjectSchema,
});

export class SettingsStore {
  readonly #filePath: string;
  #settings: HostJsonObject = {};

  constructor(filePath: string) {
    this.#filePath = filePath;
    try {
      this.#settings = SettingsFileSchema.parse(
        JSON.parse(readFileSync(filePath, "utf8")),
      ).settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Electron settings state 无法读取，将使用前端默认值");
      }
    }
  }

  get(): HostJsonObject {
    return structuredClone(this.#settings);
  }

  update(input: unknown): HostJsonObject {
    const request = SettingsUpdateInputSchema.parse(input);
    this.#settings = structuredClone(request.settings);
    this.#flush();
    return this.get();
  }

  #flush(): void {
    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({ schemaVersion: 1, settings: this.#settings }),
      "utf8",
    );
    renameSync(temporaryPath, this.#filePath);
  }
}
