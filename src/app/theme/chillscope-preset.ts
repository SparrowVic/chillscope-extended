import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Near-neutral greys are used throughout, with chroma reserved for
 * semantics. The hex values below are the same ones the `--cs-*` sheet in
 * styles.css declares — PrimeNG consumes them through this preset, components
 * consume the custom properties directly.
 *
 * The dark accent is near-white, so `primary.contrastColor` must be dark ink
 * (`--cs-accent-ink`) or button labels vanish into their own fill.
 */

/** Dark ramp: 950 canvas, 900 panel, 800 raised, 700 hairline. */
const SYGNAL_DARK_SURFACE = {
  0: '#ffffff',
  50: '#f4f5f7',
  100: '#dfe1e4',
  200: '#c6c9ce',
  300: '#b1b5bb',
  400: '#9ba0a7',
  500: '#5d636b',
  600: '#404349',
  700: '#2b2d31',
  800: '#202225',
  900: '#161719',
  950: '#0c0d0f',
};

/** Light ramp: 0 panel, 50 canvas, 200 hairline, 300 hairline-strong. */
const SYGNAL_LIGHT_SURFACE = {
  0: '#ffffff',
  50: '#f4f5f7',
  100: '#eceef1',
  200: '#e2e4e8',
  300: '#c9ccd2',
  400: '#9ba0a7',
  500: '#5d636b',
  600: '#404349',
  700: '#2c2e32',
  800: '#202225',
  900: '#161719',
  950: '#0c0d0f',
};

export const ChillscopePreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: '6px',
      // --cs-r-ctl / --cs-r-card / --cs-r-ovl (§2.2).
      md: '8px',
      lg: '10px',
      xl: '12px',
    },
  },
  semantic: {
    // §7 defines exactly one focus recipe: the K3 double ring. Routing it through the semantic
    // focusRing token puts the same ring on buttons, switches, sliders and paginators that the
    // custom `.cs-focus-ring` utility puts on hand-built controls.
    focusRing: {
      width: '0',
      style: 'none',
      color: 'transparent',
      offset: '0',
      shadow: 'var(--cs-focus-ring)',
    },
    // §3/§6: density changes geometry and spacing, but all PrimeNG size variants consume the one
    // bounded control type role. This prevents compact/comfortable from drifting to 11.5/16px.
    formField: {
      sm: {
        fontSize: 'var(--cs-font-control)',
        paddingX: '0.5rem',
        paddingY: '0.25rem',
      },
      lg: {
        fontSize: 'var(--cs-font-control)',
        paddingX: '0.75rem',
        paddingY: '0.5rem',
      },
    },
    // The accent is achromatic, so the "primary" ramp is simply the grey ramp;
    // per-scheme `primary.color` overrides below pick the exact accent step.
    primary: {
      50: '#f4f5f7',
      100: '#e9ebee',
      200: '#dfe1e4',
      300: '#c6c9ce',
      400: '#9ba0a7',
      500: '#5d636b',
      600: '#404349',
      700: '#2c2e32',
      800: '#202225',
      900: '#161719',
      950: '#0c0d0f',
    },
    colorScheme: {
      light: {
        surface: SYGNAL_LIGHT_SURFACE,
        primary: {
          color: '#1b1d20',
          hoverColor: '#2c2e32',
          activeColor: '#0c0d0f',
          contrastColor: '#ffffff',
        },
        text: {
          color: '#1b1d20',
          hoverColor: '#0c0d0f',
          mutedColor: '#5d636b',
          hoverMutedColor: '#404349',
        },
        formField: {
          // K3 (§7): controls sit on the panel as raised elements, border transparent.
          background: '#f8f9fa',
          borderColor: 'transparent',
          hoverBorderColor: 'transparent',
          focusBorderColor: '{primary.color}',
          invalidBorderColor: '#cb3038',
          color: '{text.color}',
        },
        highlight: {
          background: 'color-mix(in srgb, #1b1d20 8%, transparent)',
          focusBackground: 'color-mix(in srgb, #1b1d20 12%, transparent)',
          color: '#1b1d20',
          focusColor: '#0c0d0f',
        },
        overlay: {
          // §2.3: the light overlay step is white; the machined rim/etch/shadow arrive from the
          // unlayered material pass in styles.css.
          select: { background: '#ffffff', borderColor: '{surface.200}', color: '{text.color}' },
          popover: { background: '#ffffff', borderColor: '{surface.200}', color: '{text.color}' },
          modal: { background: '#ffffff', borderColor: '{surface.200}', color: '{text.color}' },
        },
      },
      dark: {
        surface: SYGNAL_DARK_SURFACE,
        primary: {
          color: '#e9ebee',
          hoverColor: '#ffffff',
          activeColor: '#dfe1e4',
          contrastColor: '#151619',
        },
        text: {
          color: '#dfe1e4',
          hoverColor: '#f4f5f7',
          mutedColor: '#9ba0a7',
          hoverMutedColor: '#b1b5bb',
        },
        formField: {
          background: '#202225',
          borderColor: 'transparent',
          hoverBorderColor: 'transparent',
          focusBorderColor: '{primary.color}',
          invalidBorderColor: '#ff5f57',
          color: '{text.color}',
        },
        highlight: {
          background: 'color-mix(in srgb, #e9ebee 14%, transparent)',
          focusBackground: 'color-mix(in srgb, #e9ebee 20%, transparent)',
          color: '#f4f5f7',
          focusColor: '#ffffff',
        },
        overlay: {
          // §2.1: overlay is its own surface step, one above raised. The machined rim/etch/
          // shadow arrive from the unlayered material pass in styles.css.
          select: { background: '#2c2e32', borderColor: '{surface.600}', color: '{text.color}' },
          popover: { background: '#2c2e32', borderColor: '{surface.600}', color: '{text.color}' },
          modal: { background: '#2c2e32', borderColor: '{surface.600}', color: '{text.color}' },
        },
      },
    },
  },
  components: {
    // Aura leaves the datepicker on content.background — the PANEL step. Every floating
    // surface belongs on the overlay step, so it borrows the popover tokens wholesale.
    datepicker: {
      panel: {
        background: '{overlay.popover.background}',
        borderColor: '{overlay.popover.border.color}',
        color: '{overlay.popover.color}',
      },
    },
    // K3 secondary buttons are raised fills, not outlined hairline boxes: they rise one
    // surface step on hover exactly like every other raised control (§7).
    button: {
      root: {
        sm: { fontSize: 'var(--cs-font-control)', paddingX: '0.625rem', paddingY: '0.3rem' },
        lg: {
          fontSize: 'var(--cs-font-control)',
          paddingX: '0.875rem',
          paddingY: '0.55rem',
        },
      },
      colorScheme: {
        light: {
          root: {
            secondary: {
              background: '{surface.100}',
              hoverBackground: '{surface.200}',
              activeBackground: '{surface.300}',
              borderColor: 'transparent',
              hoverBorderColor: 'transparent',
              activeBorderColor: 'transparent',
              color: '{text.color}',
            },
          },
        },
        dark: {
          root: {
            secondary: {
              background: '{surface.800}',
              hoverBackground: '{surface.700}',
              activeBackground: '{surface.600}',
              borderColor: 'transparent',
              hoverBorderColor: 'transparent',
              activeBorderColor: 'transparent',
              color: '{text.color}',
            },
          },
        },
      },
    },
    // §2.1 allows four surfaces only; the stock dark track and tooltip chip sat on the
    // hairline value #2b2d31 instead of a roster step.
    toggleswitch: {
      colorScheme: {
        dark: {
          root: {
            background: '{surface.800}',
            hoverBackground: '{surface.700}',
          },
        },
      },
    },
    tooltip: {
      colorScheme: {
        dark: {
          root: { background: '#2c2e32' },
        },
      },
    },
  },
});
