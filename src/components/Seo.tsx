import { useEffect } from 'react'

type SeoProps = {
  title: string
  description: string
}

export function Seo({ title, description }: SeoProps) {
  useEffect(() => {
    document.title = title
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]') ?? document.createElement('meta')
    meta.name = 'description'
    meta.content = description
    if (!meta.parentElement) document.head.append(meta)
  }, [description, title])

  return null
}
