// Adapted from https://github.com/Wildhoney/ReactShadow/blob/master/src/core/index.js
import {
  ComponentPropsWithoutRef,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export const createShadowRoot = (ssr?: boolean) =>
  forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
    function ShadowRoot({ children, ...props }, ref) {
      const node = useRef<HTMLDivElement>(null)
      const [root, setRoot] = useState<ShadowRoot | null>(null)

      useEffect(() => {
        if (typeof ref === 'function') {
          ref(node.current)
        } else if (ref) {
          ref.current = node.current
        }

        if (node.current) {
          if (import.meta.env.SSR) {
            setRoot(node.current.shadowRoot)
          } else {
            setRoot(
              node.current.attachShadow({
                mode: 'open',
                delegatesFocus: true,
              })
            )
          }
        }
      })

      return (
        <div ref={node} className="ShadowRoot" {...props}>
          {import.meta.env.SSR ? (
            // @ts-ignore
            <template shadowroot="open">{children}</template>
          ) : (
            root && createPortal(children, root as any)
          )}
        </div>
      )
    }
  )
