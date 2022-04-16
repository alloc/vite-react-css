import * as fs from 'fs'
import * as path from 'path'
import * as vite from 'vite'
import '@vitejs/plugin-react'
import { reactExtensionRE, styleExtensionRE } from './regex'
import { getPostcssPlugin } from './postcss'
import { getBabelPlugin } from './babel'
import { cacheOnDemand } from './utils'

type Options = {
  /**
   * The tag name to use for the scope element, which wraps around
   * the element tree returned by your React components.
   *
   * @default "div"
   */
  scopeType?: keyof JSX.IntrinsicElements
  /**
   * If the main component in a JSX or TSX module returns a JSX element
   * with a tag name in the given `scopeTags` array, its `className` prop
   * will be edited **instead** of being wrapped with a scope element.
   *
   * In other words, the root JSX element *becomes* the scope element
   * if its element type exists in `scopeTags`. Composite elements
   * (eg: capitalized) are valid in here, too.
   */
  scopeTags?: string[]
}

export default (options: Options = {}): vite.Plugin => {
  let projectRoot: string

  const dirCache = cacheOnDemand(
    {} as Record<string, string[]>, //
    dir => fs.readdirSync(dir)
  )

  const postcssPlugin = getPostcssPlugin()
  const babelPlugin = getBabelPlugin(
    options.scopeType || 'div',
    options.scopeTags || [],
    () => projectRoot,
    dirCache
  )

  return {
    name: 'vite-react-css:babel',
    enforce: 'pre',
    api: {
      reactBabel({ plugins }) {
        plugins.push(babelPlugin)
      },
    },
    config: () => ({
      css: { postcss: { plugins: [postcssPlugin as any] } },
    }),
    configResolved(config) {
      projectRoot = config.root

      if (!config.plugins.some(p => p.name === 'vite:react-babel')) {
        config.logger.warn(
          '[vite-react-css] You must have "@vitejs/plugin-react" configured'
        )
      }
    },
    configureServer(server) {
      server.watcher?.on('all', (event, id) => {
        const dir = path.dirname(id)
        delete dirCache[dir]

        if (
          (event == 'add' || event == 'unlink') &&
          styleExtensionRE.test(id)
        ) {
          const rawId = id.replace(styleExtensionRE, '')
          const name = path.basename(rawId)
          const reactFile = dirCache[dir].find(
            file =>
              reactExtensionRE.test(file) &&
              name == file.replace(reactExtensionRE, '')
          )
          if (reactFile) {
            server.watcher!.emit('change', reactFile)
          }
        }
      })
    },
  }
}
