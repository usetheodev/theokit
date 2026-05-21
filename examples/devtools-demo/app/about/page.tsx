import { Badge, Card } from '@usetheo/ui'
import { Info } from 'lucide-react'

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Badge variant="outline" className="gap-1.5">
        <Info className="h-3 w-3" />
        About this page
      </Badge>
      <h2 className="mt-3 text-3xl font-bold tracking-tight">About</h2>
      <Card className="mt-6 p-6">
        <p className="text-muted-foreground text-sm">
          This is <code className="bg-muted rounded px-1.5 py-0.5">app/about/page.tsx</code>. Open
          the devtools <strong>Routes</strong> tab — this route should be highlighted while
          you&apos;re here.
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          Click another link in the nav to watch the highlight move.
        </p>
      </Card>
    </div>
  )
}
