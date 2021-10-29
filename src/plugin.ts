import * as fs from 'fs'
import * as path from 'path'
import * as vite from 'vite'
import '@vitejs/plugin-react'
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
  scopeTag?: keyof JSX.IntrinsicElements
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
  const dirCache: Record<string, string[]> = {}
  let projectRoot: string

  const postcssPlugin = getPostcssPlugin()
  const babelPlugin = getBabelPlugin(
    options.scopeTag || 'div',
    options.scopeTags || [],
    () => projectRoot,
    cacheOnDemand(dirCache, dir => fs.readdirSync(dir))
  )

  return {
    name: 'vite-react-css:babel',
    enforce: 'pre',
    babel: {
      plugins: [babelPlugin],
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
        delete dirCache[path.dirname(id)]
      })
    },
  }
}
