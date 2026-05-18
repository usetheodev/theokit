// @ts-expect-error — virtual module resolved at build time by the banner integration
import bannerText from 'virtual:integration:banner/text'

export default function Page() {
  return (
    <main>
      <h1>Integration demo</h1>
      <p>{bannerText as string}</p>
    </main>
  )
}
