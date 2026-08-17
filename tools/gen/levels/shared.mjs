// Row constants shared between a layout module and its own docstrings.
//
// A layout's `groundTopRow` is referenced twice inside the same object literal — once as the field and
// again in `spikes` / `enemies`, which are authored relative to the walking surface. A plain `const` at
// module scope cannot be read from inside the literal that defines it, and repeating the number is
// exactly the kind of second definition this project keeps deleting. So the surface rows live here.
//
// Deliberately NOT a general "level constants" dumping ground. One value per level, named for it, and
// nothing that could instead be derived by `levelBuilder.mjs` from the layout it is given.

/** level-01's walking surface: two rows of fill below it, in a 22-row map. */
export const GROUND_TOP_ROW_01 = 20;
