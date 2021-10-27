export function isExternalSheet(elem: Element): elem is HTMLLinkElement {
  return elem.tagName === 'LINK' && elem.getAttribute('rel') === 'stylesheet'
}

export function isInlineSheet(elem: Element): elem is HTMLStyleElement {
  return elem.tagName === 'STYLE'
}

export type Sheet = HTMLStyleElement | HTMLLinkElement

export function isSheet(elem: Element): elem is Sheet {
  return isExternalSheet(elem) || isInlineSheet(elem)
}

export type ExtractedStyle =
  | { href: string; css?: undefined }
  | { css: string; href?: undefined }

export function extractStyles(root: Document) {
  const extracted: ExtractedStyle[] = []
  const headElements = root.head.children
  for (let i = 0; i < headElements.length; i++) {
    const elem = headElements.item(i)!
    if (isExternalSheet(elem)) {
      extracted.push({ href: (elem as HTMLLinkElement).href })
    } else if (isInlineSheet(elem)) {
      extracted.push({ css: elem.textContent! })
    }
  }
  return extracted.reverse()
}

let nextId = 1

export const renderStyles = (extracted: ExtractedStyle[]) =>
  extracted.map(({ css, href }, i) =>
    css ? (
      <style key={nextId++} type="text/css">
        {css}
      </style>
    ) : (
      <link key={nextId++} rel="stylesheet" href={href} />
    )
  )
