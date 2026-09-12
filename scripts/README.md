# Level pack tools

Level generation runs offline and never ships in the web or iOS app. It creates
solver-verified candidates on stdout so the pack can be reviewed before it is
added under `src/data/level-packs/`.

Generate the next 20-level weekly pack with a fresh deterministic seed:

```sh
npm run levels:generate -- --start=31 --pack=week-02 --seed=1025517058 --plan=6,6,6,6,5,5,5,5,4,4,4,4,3,3,3,3,2,2,1,1
```

The generator loads prior metadata and rejects duplicate preset layouts,
rotated/mirrored equivalents, and reused complete source solutions. Save the
reviewed runtime entries in `week-NN.ts` and their generation records in the
matching `week-NN.metadata.json`, then add the pack to `src/data/levels.ts`.

Validate the complete catalog before release:

```sh
npm run levels:validate
```

Validation checks sequential IDs, Free Play ordering, valid non-overlapping
placements, solvability, preset fingerprints, source-solution uniqueness, and
metadata consistency.
