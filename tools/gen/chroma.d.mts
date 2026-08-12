/**
 * Typed view of `chroma.mjs`, a re-exporting barrel over `chromaKey.d.mts` and
 * `chromaComponents.d.mts` — mirrors the `.mjs` split so every `.ts` importer sees the same
 * shape it always has.
 */

export type { ChromaThresholds } from './chromaKey.d.mts';
export {
  CHROMA,
  chromaThresholds,
  keyDistance,
  hasRealAlpha,
  estimateKeyColour,
  borderKey,
  estimateFieldColour,
  keyOut,
} from './chromaKey.d.mts';
export {
  components,
  trimHalo,
  dropCastShadow,
  removeSpecks,
  assertComponentPolicy,
  keepLargestComponent,
  multiComponentStates,
} from './chromaComponents.d.mts';
