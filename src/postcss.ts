import type { Plugin as PostcssPlugin } from 'postcss'
import parseSelector = require('postcss-selector-parser')
import { htmlPrefixRE, scopePseudoRE, styleExtensionRE } from './regex'

export const getPostcssPlugin = (): PostcssPlugin => ({
  postcssPlugin: 'vite-react-css:postcss',
  Root(root, { result: { opts } }) {
    const id = opts.from!
    const scopeId = styleExtensionRE.exec(id)?.[2]
    if (!scopeId) {
      return
    }

    const t = parseSelector
    const space = t.combinator({ value: ' ' })
    const scopeClassName = t.className({ value: scopeId })

    root.walkRules(rule => {
      let transform: parseSelector.SyncProcessor

      const rawSelector = rule.selector
      if (scopePseudoRE.test(rawSelector)) {
        transform = root => {
          root.walk(node => {
            if (node.value === ':scope') {
              node.replaceWith(scopeClassName)
            }
          })
        }
      } else if (htmlPrefixRE.test(rawSelector)) {
        transform = root => {
          for (const selector of root.nodes) {
            const firstSpace = selector.nodes.find(node => node.value == ' ')
            if (firstSpace) {
              selector.insertAfter(firstSpace, space)
              selector.insertAfter(firstSpace, scopeClassName)
            } else {
              selector.nodes.push(space, scopeClassName)
            }
          }
        }
      } else {
        transform = root => {
          for (const selector of root.nodes) {
            const firstNode = selector.first
            const scopeClassName = t.className({
              value: scopeId,
              spaces: { before: firstNode.rawSpaceBefore },
            })
            firstNode.rawSpaceBefore = ''
            selector.insertBefore(firstNode, scopeClassName)
            selector.insertAfter(scopeClassName, space)
          }
        }
      }

      const newSelector = parseSelector(transform).processSync(rawSelector)
      rule.selector = newSelector
    })
  },
})
