/**
 * Theo brand mark — the canonical pixel-art mascot from theo-website/public/logo.png.
 *
 * Embedded as base64 PNG (see ./assets/logo-data.ts) so the devtools UI has
 * zero external asset dependency. `image-rendering: pixelated` preserves the
 * crisp pixel-art look at small sizes.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { THEO_LOGO_BASE64 } from '../assets/logo-data.js'

export interface TheoLogoProps {
  size?: number
}

export function TheoLogo({ size = 18 }: TheoLogoProps) {
  return (
    <img
      src={THEO_LOGO_BASE64}
      alt="Theo"
      width={size}
      height={size}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        imageRendering: 'pixelated',
      }}
    />
  )
}
