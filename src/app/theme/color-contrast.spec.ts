import { describe, expect, it } from 'vitest';

import { SERIES_CATALOG, SERIES_IDS } from '../core/data/series.catalog';

type ThemeName = 'light' | 'dark';
type Rgb = readonly [red: number, green: number, blue: number];

const THEMES: readonly ThemeName[] = ['light', 'dark'];
const TEXT_TOKENS = ['--cs-text', '--cs-muted'] as const;
const STATUS_TOKENS = ['--cs-ok', '--cs-warn', '--cs-crit'] as const;
const TINTED_STATUS_TOKENS = ['--cs-ok', '--cs-warn'] as const;
const SURFACE_TOKENS = ['--cs-canvas', '--cs-panel', '--cs-panel-raised', '--cs-overlay'] as const;
const PIPE_TOKENS = ['--cs-cold', '--cs-hot'] as const;
const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;
const TAG_TINT = 0.14;

interface FileReader {
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface NodeProcess {
  cwd(): string;
  getBuiltinModule(name: 'fs'): FileReader;
}

const nodeProcess = (globalThis as typeof globalThis & { process?: NodeProcess }).process;
if (!nodeProcess) {
  throw new Error('The contrast contract spec requires the Node test runtime.');
}
const GLOBAL_STYLES = nodeProcess
  .getBuiltinModule('fs')
  .readFileSync(`${nodeProcess.cwd()}/src/styles.css`, 'utf8');
const LIGHT_TOKENS = tokensIn(ruleBody(':root'));
const DARK_TOKENS = { ...LIGHT_TOKENS, ...tokensIn(ruleBody(':root.app-dark')) };

function ruleBody(selector: string): string {
  const selectorStart = GLOBAL_STYLES.indexOf(`${selector} {`);
  if (selectorStart < 0) {
    throw new Error(`Could not find ${selector} in styles.css.`);
  }
  const openingBrace = GLOBAL_STYLES.indexOf('{', selectorStart);
  let depth = 0;
  for (let index = openingBrace; index < GLOBAL_STYLES.length; index++) {
    if (GLOBAL_STYLES[index] === '{') {
      depth++;
    } else if (GLOBAL_STYLES[index] === '}') {
      depth--;
      if (depth === 0) {
        return GLOBAL_STYLES.slice(openingBrace + 1, index);
      }
    }
  }
  throw new Error(`Could not read the closing brace for ${selector}.`);
}

function tokensIn(body: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...body.matchAll(/(--cs-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
}

function token(theme: ThemeName, name: string): string {
  const value = (theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS)[name] ?? '';
  expect(value, `${theme} ${name} must resolve from the global token sheet`).not.toBe('');
  return value;
}

function parseHex(value: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(value)) {
    throw new Error(`Expected a six-digit hex colour, received "${value}".`);
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [red, green, blue] = parseHex(color);
  return (
    channelLuminance(red) * 0.2126 +
    channelLuminance(green) * 0.7152 +
    channelLuminance(blue) * 0.0722
  );
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground: string, background: string, opacity: number): string {
  const foregroundChannels = parseHex(foreground);
  const backgroundChannels = parseHex(background);
  const channels = foregroundChannels.map((channel, index) =>
    Math.round(channel * opacity + backgroundChannels[index] * (1 - opacity)),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

describe('SYGNAL contrast contract', () => {
  it.each(THEMES)('keeps %s text and statuses readable on every surface', (theme) => {
    for (const foregroundToken of [...TEXT_TOKENS, ...STATUS_TOKENS]) {
      for (const surfaceToken of SURFACE_TOKENS) {
        expect(
          contrastRatio(token(theme, foregroundToken), token(theme, surfaceToken)),
          `${theme} ${foregroundToken} on ${surfaceToken}`,
        ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    }
  });

  it.each(THEMES)('keeps %s tinted status tags readable on every surface', (theme) => {
    for (const statusToken of TINTED_STATUS_TOKENS) {
      const status = token(theme, statusToken);
      for (const surfaceToken of SURFACE_TOKENS) {
        const surface = token(theme, surfaceToken);
        expect(
          contrastRatio(status, composite(status, surface, TAG_TINT)),
          `${theme} ${statusToken} on its tint over ${surfaceToken}`,
        ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    }
  });

  it.each(THEMES)('pairs the %s critical fill with readable ink', (theme) => {
    expect(
      contrastRatio(token(theme, '--cs-crit-ink'), token(theme, '--cs-crit')),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it.each(THEMES)('keeps every data series distinguishable in %s', (theme) => {
    for (const id of SERIES_IDS) {
      for (const surfaceToken of SURFACE_TOKENS) {
        expect(
          contrastRatio(SERIES_CATALOG[id].color, token(theme, surfaceToken)),
          `${theme} ${id} on ${surfaceToken}`,
        ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
      }
    }
  });

  it.each(THEMES)('keeps the %s schematic circuit visible below the flow dashes', (theme) => {
    const panel = token(theme, '--cs-panel');
    const opacity = Number(token(theme, '--cs-pipe-opacity'));

    for (const pipeToken of PIPE_TOKENS) {
      const pipe = token(theme, pipeToken);
      expect(
        contrastRatio(composite(pipe, panel, opacity), panel),
        `${theme} ${pipeToken} at ${opacity} opacity`,
      ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    }
  });
});
