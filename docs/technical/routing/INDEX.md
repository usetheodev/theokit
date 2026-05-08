# Routing — Pesquisa SOTA

## Escopo
File-based routing para `app/` directory. Scan → manifest → React Router CSR.

## Packages alvo
- `theo` (vite-plugin) — route scanning, virtual module generation
- `react-router` — runtime routing

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js route-discovery.ts | `collectAppFiles()`, regex matchers, `normalizeAppPath()` |
| Next.js app-paths.ts | File path → URL conversion, strip groups/slots/page suffix |
| Next.js layout-router.tsx | Nested boundary composition: Error → Loading → NotFound → Content |
| react-router v7 | `createBrowserRouter`, nested routes, `errorElement`, `<Outlet />` |
| generouted | Vite glob import → route tree generation, client-side |
| vite-plugin-pages | Virtual module `~pages`, file-system scan, React resolver |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md
- reference-research-routing.md — Comparação Next.js vs Rails (file scan, matching, layouts)
- reference-research-virtual-modules.md — Virtual modules: Vite \0 prefix vs Next.js loaders vs glob

## Gaps para pesquisar
- [x] React Router vs TanStack Router — decidido: react-router (maturo, leve, nested layouts nativo)
- [x] File scanning approach — Vite plugin com `fs` recursivo
- [x] Virtual module pattern — `/@theo/route-manifest` + `/@theo/entry-client`
- [x] Nested layout composition — pathless route wrapper pattern
- [x] Error boundary inside layout — pathless route com `errorElement`
- [x] HMR para new/deleted route files — `configureServer` + watcher + `invalidateModule` + full-reload
- [x] Virtual module HMR — two modules (manifest data + entry code), invalidate manifest on route change
- [ ] Dynamic segments (`[id]`, `[...rest]`) — Onda 2 fora de escopo, mas design-ready
- [ ] Route groups `(marketing)` — futuro
- [ ] Lazy loading com `React.lazy` e code splitting
