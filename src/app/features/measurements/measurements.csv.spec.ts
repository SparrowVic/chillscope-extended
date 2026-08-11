import { describe, expect, it } from 'vitest';
import { csvFileName, csvSeparator, toCsv } from './measurements.csv';

describe('csvSeparator', () => {
  it('uses a semicolon for Polish, which is what Excel splits on there', () => {
    expect(csvSeparator('pl')).toBe(';');
  });

  it('falls back to a comma for every other language', () => {
    expect(csvSeparator('en')).toBe(',');
    expect(csvSeparator('de')).toBe(',');
  });
});

describe('toCsv', () => {
  it('separates fields with the given delimiter and rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c']], ',')).toBe('a,b\r\nc');
    expect(toCsv([['a', 'b']], ';')).toBe('a;b');
  });

  it('quotes a field that contains the delimiter in use', () => {
    expect(toCsv([['a,b']], ',')).toBe('"a,b"');
    expect(toCsv([['a;b']], ';')).toBe('"a;b"');
  });

  it('leaves a field alone when it only contains the other delimiter', () => {
    expect(toCsv([['a,b']], ';')).toBe('a,b');
  });

  it('doubles embedded quotes and quotes the field', () => {
    expect(toCsv([['say "hi"']], ',')).toBe('"say ""hi"""');
  });

  it('quotes fields containing newlines', () => {
    expect(toCsv([['line\nbreak']], ',')).toBe('"line\nbreak"');
    expect(toCsv([['carriage\rreturn']], ',')).toBe('"carriage\rreturn"');
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([], ',')).toBe('');
  });
});

describe('csvFileName', () => {
  it('names the last day the half-open range actually covers', () => {
    const from = Date.parse('2026-08-01T00:00:00.000Z');
    const to = Date.parse('2026-08-05T00:00:00.000Z');
    expect(csvFileName('measurements', from, to)).toBe('measurements_2026-08-01_2026-08-04.csv');
  });
});
