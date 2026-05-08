# Layouts — Pesquisa SOTA

## Escopo
Nested layouts, composição, persistência entre navegações.

## Packages alvo
- `theo` (vite-plugin) — layout discovery durante scan
- `react-router` — `<Outlet />` para composição

## Referências-chave

| Fonte | O que extrair |
|-------|---------------|
| Next.js layout-router.tsx | OuterLayoutRouter: Error → Loading → NotFound → Content nesting |
| Next.js create-component-tree.tsx | Layout tree construction, special file collection |
| react-router v7 | Nested routes + `<Outlet />`, layout as parent route element |
| SvelteKit | `+layout.svelte` composição automática |

## Arquivos nesta pasta
- INDEX.md (este arquivo)
- improvement-roadmap.md

## Gaps para pesquisar
- [x] Layout como parent route em React Router — `element: <Layout />` com `<Outlet />` children
- [x] Layout persistence — React Router mantém layout mounted entre child navigations
- [ ] Metadata per layout (title, head tags) — futuro
- [ ] Streaming layouts com Suspense — futuro (SSR)
- [ ] Layout transitions / animations — futuro
