import { Badge, Card } from '@usetheo/ui'
import { Package } from 'lucide-react'

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Badge variant="outline" className="gap-1.5">
        <Package className="h-3 w-3" />
        Products route
      </Badge>
      <h2 className="mt-3 text-3xl font-bold tracking-tight">Products</h2>
      <Card className="mt-6 p-6">
        <p className="text-muted-foreground text-sm">
          This is <code className="bg-muted rounded px-1.5 py-0.5">app/products/page.tsx</code>. The
          devtools <strong>Routes</strong> tab should highlight this leaf now (and{' '}
          <code className="bg-muted rounded px-1.5 py-0.5">app/layout.tsx</code> in its chain).
        </p>
      </Card>
    </div>
  )
}
