const ROW_SEPARATOR = '\r\n';
const MIME_TYPE = 'text/csv;charset=utf-8';

/** Spreadsheet applications only detect UTF-8 in a CSV when the byte order mark is present. */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Excel splits a CSV on the list separator of the machine's locale, and on a Polish Windows that is
 * a semicolon — a comma-separated file lands there as one column per row. The header row is already
 * translated, so the file is locale-specific either way; the delimiter follows suit.
 */
const SEPARATORS: Readonly<Record<string, string>> = { pl: ';' };
const DEFAULT_SEPARATOR = ',';

export function csvSeparator(language: string): string {
  return SEPARATORS[language] ?? DEFAULT_SEPARATOR;
}

function escapeField(field: string, separator: string): string {
  return field.includes(separator) || /["\n\r]/.test(field)
    ? `"${field.replaceAll('"', '""')}"`
    : field;
}

export function toCsv(rows: readonly (readonly string[])[], separator: string): string {
  return rows
    .map((row) => row.map((field) => escapeField(field, separator)).join(separator))
    .join(ROW_SEPARATOR);
}

export function toCsvBlob(rows: readonly (readonly string[])[], separator: string): Blob {
  return new Blob([BYTE_ORDER_MARK, toCsv(rows, separator)], { type: MIME_TYPE });
}

/** `to` is the exclusive end of the range, so the name reports the last day actually covered. */
export function csvFileName(base: string, from: number, to: number): string {
  return `${base}_${isoDate(from)}_${isoDate(to - 1)}.csv`;
}

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
