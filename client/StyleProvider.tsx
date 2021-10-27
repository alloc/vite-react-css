// Adapted from https://github.com/Wildhoney/ReactShadow/blob/master/src/core/index.js
import {
  ForwardedRef,
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal, render } from 'react-dom'
import { extractStyles, isSheet, renderStyles, Sheet } from './styles'

declare global {
  interface ShadowRoot {
    adoptedStyleSheets: readonly CSSStyleSheet[]
  }
  interface CSSStyleSheet {
    replaceSync(css: string): void
  }
}

let shadowRoots = new Set<ShadowRoot>()
let globalStyles: JSX.Element[] = []

export const createStyleProvider = (ssr?: boolean) =>
  forwardRef(function StyleProvider(
    { css, children }: { css: string; children: ReactNode },
    forwardedRef: ForwardedRef<HTMLDivElement>
  ) {
    const privateRef = useRef<HTMLDivElement | null>(null)
    const [root, setRoot] = useState<ShadowRoot | null>(null)
    const [styles, setStyles] = useState<JSX.Element[] | undefined>()

    useEffect(() => {
      const elem = privateRef.current
      if (!elem) return

      const shadowRoot = ssr
        ? elem.shadowRoot!
        : elem.attachShadow({
            mode: 'open',
            delegatesFocus: true,
          })

      setRoot(shadowRoot)
      setStyles(globalStyles)

      if (import.meta.env.DEV && !import.meta.env.SSR) {
        if (!shadowRoot) return
        shadowRoots.add(shadowRoot)
        return () => {
          shadowRoots.delete(shadowRoot)
        }
      }
    }, [])

    const ref = useCallback(
      (node: HTMLDivElement | null) => {
        privateRef.current = node
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef]
    )

    children = (
      <>
        {children}
        {styles}
        <style type="text/css">{css}</style>
      </>
    )

    debugger
    return (
      <div className="ShadowRoot" ref={ref}>
        {ssr ? (
          // @ts-ignore
          <template shadowroot="open">{children}</template>
        ) : (
          root && createPortal(children, root as any)
        )}
      </div>
    )
  })

if (!import.meta.env.SSR) {
  globalStyles = renderStyles(extractStyles(document))

  if (import.meta.env.DEV) {
    const observer = new MutationObserver(() => {
      const extracted = extractStyles(document)
      globalStyles = renderStyles(extracted)

      console.log('updateShadowRoots:', Array.from(shadowRoots))
      for (const shadowRoot of shadowRoots) {
        const { childNodes } = shadowRoot

        // Remove old <style> and <link rel="stylesheet"> nodes.
        const oldSheets: Sheet[] = []
        for (let i = 0; i < childNodes.length; i++) {
          const childNode: any = childNodes.item(i)
          if (isSheet(childNode)) {
            oldSheets.push(childNode)
          }
        }

        // The last stylesheet is managed by the StyleProvider component.
        oldSheets.pop()
        for (const sheet of oldSheets) {
          sheet.remove()
        }

        for (const { css, href } of extracted) {
          if (css) {
            const style = document.createElement('style')
            style.textContent = css
            shadowRoot.prepend(style)
          } else {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = href!
            shadowRoot.prepend(link)
          }
        }
      }
    })

    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  }
}
