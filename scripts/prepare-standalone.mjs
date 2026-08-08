import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function prepareStandalone(root = process.cwd()) {
  const standalone = path.join(root, ".next", "standalone");
  const server = path.join(standalone, "server.js");
  const sourceStatic = path.join(root, ".next", "static");
  const sourcePublic = path.join(root, "public");

  if (!(await exists(server))) {
    throw new Error("Standalone server is missing. Run `npm run build` before `npm start`.");
  }
  if (!(await exists(sourceStatic))) {
    throw new Error("Standalone static assets are missing. Run `npm run build` before `npm start`.");
  }

  const destinationStatic = path.join(standalone, ".next", "static");
  await rm(destinationStatic, { recursive: true, force: true });
  await cp(sourceStatic, destinationStatic, { recursive: true, force: true });

  const destinationPublic = path.join(standalone, "public");
  await rm(destinationPublic, { recursive: true, force: true });
  if (await exists(sourcePublic)) {
    await cp(sourcePublic, destinationPublic, { recursive: true, force: true });
  }

  return { server, staticAssets: destinationStatic, publicAssets: destinationPublic };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await prepareStandalone();
    console.log("Standalone runtime assets prepared.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Standalone runtime preparation failed.");
    process.exitCode = 1;
  }
}
