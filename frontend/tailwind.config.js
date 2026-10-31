/** @type {import('tailwindcss').Config} */
/**
 * Colors map to CSS variables in `src/index.css` (:root and .dark).
 * Prefer `brand-*` over legacy `primary` alias.
 * Dark mode: class strategy on <html>.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      colors: {
        brand: {
          primary: "var(--color-brand-primary)",
          "primary-foreground": "var(--color-brand-primary-foreground)",
          hover: "var(--color-brand-hover)",
          pressed: "var(--color-brand-pressed)",
          subtle: "var(--color-brand-subtle)",
          muted: "var(--color-brand-muted)",
          banner: "var(--color-brand-banner)",
        },
        /** @deprecated Prefer brand-primary — kept for a few legacy className strings. */
        primary: {
          DEFAULT: "var(--color-brand-primary)",
          foreground: "var(--color-brand-primary-foreground)",
        },
        surface: {
          base: "var(--color-surface-base)",
          raised: "var(--color-surface-raised)",
          elevated: "var(--color-surface-elevated)",
          subtle: "var(--color-surface-subtle)",
          inverse: "var(--color-surface-inverse)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverse: "var(--color-text-inverse)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          subtle: "var(--color-border-subtle)",
        },
        status: {
          success: "var(--color-status-success)",
          "success-subtle": "var(--color-status-success-subtle)",
          "success-foreground": "var(--color-status-success-foreground)",
          warning: "var(--color-status-warning)",
          "warning-subtle": "var(--color-status-warning-subtle)",
          "warning-foreground": "var(--color-status-warning-foreground)",
          danger: "var(--color-status-danger)",
          "danger-subtle": "var(--color-status-danger-subtle)",
          "danger-foreground": "var(--color-status-danger-foreground)",
          "danger-hover": "var(--color-status-danger-hover)",
          "danger-pressed": "var(--color-status-danger-pressed)",
          info: "var(--color-status-info)",
          "info-subtle": "var(--color-status-info-subtle)",
          "info-foreground": "var(--color-status-info-foreground)",
          neutral: "var(--color-status-neutral)",
          "neutral-subtle": "var(--color-status-neutral-subtle)",
          "neutral-foreground": "var(--color-status-neutral-foreground)",
        },
        focus: {
          ring: "var(--color-focus-ring)",
        },
        orange: {
          950: "var(--color-orange-950)",
        },
        accent: {
          secondary: "var(--color-accent-secondary)",
          "secondary-foreground": "var(--color-accent-secondary-foreground)",
          "secondary-subtle": "var(--color-accent-secondary-subtle)",
          tertiary: "var(--color-accent-tertiary)",
          "tertiary-foreground": "var(--color-accent-tertiary-foreground)",
          "tertiary-subtle": "var(--color-accent-tertiary-subtle)",
        },
        state: {
          hover: "var(--color-state-hover)",
          pressed: "var(--color-state-pressed)",
          selected: "var(--color-state-selected)",
          disabled: "var(--color-state-disabled)",
          "disabled-text": "var(--color-state-disabled-text)",
        },
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        dropdown: "var(--shadow-dropdown)",
        modal: "var(--shadow-modal)",
      },
    },
  },
  plugins: [],
};
