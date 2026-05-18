import { useParams } from 'react-router'

export default function BlogPostPage() {
  const params = useParams<{ id: string }>()
  return (
    <article>
      <h1>Post: {params.id}</h1>
      <p>This page is rendered for the dynamic segment <code>[id]</code>.</p>
    </article>
  )
}
