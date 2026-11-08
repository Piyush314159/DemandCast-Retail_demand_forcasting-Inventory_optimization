import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "./workspace";

export async function readWorkspace(): Promise<Workspace> {
  // A custom snapshot is supplied at runtime, not bundled with the application.
  const contents = process.env.DEMANDCAST_SNAPSHOT_PATH
    ? await readFile(
        /* turbopackIgnore: true */ process.env.DEMANDCAST_SNAPSHOT_PATH,
        "utf8",
      )
    : await readFile(
        path.join(process.cwd(), "data", "workspace.json"),
        "utf8",
      );
  const data: Workspace = JSON.parse(contents);
  if (
    data.version !== 1 ||
    !Array.isArray(data.models) ||
    !Array.isArray(data.quality)
  ) {
    throw new Error("Unsupported workspace snapshot");
  }
  return data;
}
