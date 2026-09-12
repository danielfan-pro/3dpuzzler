import { ORIGINAL_LEVELS } from "../src/data/level-packs/original.ts";
import { readdirSync, readFileSync } from "node:fs";
import { cellsForFixed, fingerprint, fingerprintHash, searchSolution } from "./generate-levels.mjs";

const packDirectory = new URL("../src/data/level-packs/", import.meta.url);
const metadataFiles = readdirSync(packDirectory).filter((name) => name.endsWith(".metadata.json")).sort();
const metadata = metadataFiles.flatMap((name) => JSON.parse(readFileSync(new URL(name, packDirectory), "utf8")));
const generatedPacks = [];
for (const metadataFile of metadataFiles) {
  const packExports = await import(new URL(metadataFile.replace(".metadata.json", ".ts"), packDirectory));
  const levels = Object.values(packExports).find(Array.isArray);
  if (!levels) throw new Error(`No level array exported by ${metadataFile}`);
  generatedPacks.push(...levels);
}
const numberedLevels = [...ORIGINAL_LEVELS, ...generatedPacks].sort((a, b) => a.id - b.id);
const LEVELS = [...numberedLevels, { id: 0, name: "Free Play", fixedPieces: [] }];

const numbered = LEVELS.filter((level) => level.name !== "Free Play");
const ids = new Set();
const presetFingerprints = new Set();

for (const [index, level] of numbered.entries()) {
  if (level.id !== index + 1 || level.name !== `Level ${level.id}`) throw new Error(`Level sequence breaks at ${level.name}`);
  if (ids.has(level.id)) throw new Error(`Duplicate level ID ${level.id}`);
  ids.add(level.id);
  const presetFingerprint = fingerprintHash(fingerprint(cellsForFixed(level)));
  if (presetFingerprints.has(presetFingerprint)) throw new Error(`Duplicate or symmetric preset layout at ${level.name}`);
  presetFingerprints.add(presetFingerprint);
  if (!searchSolution(level.fixedPieces)) throw new Error(`${level.name} is not solvable`);
}

if (LEVELS.at(-1)?.name !== "Free Play" || LEVELS.at(-1)?.id !== 0) throw new Error("Free Play must remain last with permanent ID 0");
const metadataById = new Map(metadata.map((item) => [item.levelId, item]));
for (const level of numbered.filter(({ id }) => id >= 17)) {
  const item = metadataById.get(level.id);
  const actualFingerprint = fingerprintHash(fingerprint(cellsForFixed(level)));
  if (!item || item.presetCount !== level.fixedPieces.length || item.presetFingerprint !== actualFingerprint) {
    throw new Error(`Generation metadata does not match ${level.name}`);
  }
}
if (new Set(metadata.map(({ solutionFingerprint }) => solutionFingerprint)).size !== metadata.length) {
  throw new Error("Duplicate source solutions found in generated metadata");
}

console.log(`Validated ${numbered.length} numbered levels plus Free Play.`);
