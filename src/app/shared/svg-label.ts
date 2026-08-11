/** SVG text has no native wrapping; keep custom labels legible without losing their full value. */
export const SVG_LABEL_MAX_LENGTH = 24;

export function compactSvgLabel(value: string): string {
  const characters = [...value];
  if (characters.length <= SVG_LABEL_MAX_LENGTH) {
    return value;
  }
  return `${characters
    .slice(0, SVG_LABEL_MAX_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}
