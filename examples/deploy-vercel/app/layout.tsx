import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>TheoKit deploy-vercel example</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
