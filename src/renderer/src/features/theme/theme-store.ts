/**
 * Applies the primary color from settings to the CSS custom properties.
 * Generates dark and soft variants automatically.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  }
}

function darken(hex: string, amount = 0.15): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)))
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)))
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function softColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#fff0e8'
  const r = Math.min(255, Math.round(rgb.r * 0.15 + 255 * 0.85))
  const g = Math.min(255, Math.round(rgb.g * 0.15 + 255 * 0.85))
  const b = Math.min(255, Math.round(rgb.b * 0.15 + 255 * 0.85))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export const DEFAULT_PRIMARY = '#0e7490'

export function applyThemeColor(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--color-primary', hex)
  root.style.setProperty('--color-primary-dark', darken(hex))
  root.style.setProperty('--color-primary-soft', softColor(hex))
  root.style.setProperty('--shadow-hover-primary', `4px 4px 0 ${darken(hex, 0.25)}`)
}

export function resetThemeColor(): void {
  applyThemeColor(DEFAULT_PRIMARY)
}
