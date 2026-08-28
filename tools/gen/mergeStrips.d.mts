export interface Strip {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function mergeStrips(strips: Strip[]): Strip[];
