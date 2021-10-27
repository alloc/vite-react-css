import * as path from 'path'
import * as vite from 'vite'
import '@vitejs/plugin-react'
import { getPostcssPlugin } from './postcss'
import { getBabelPlugin } from './babel'

type Options = {
  /**
   * The tag name to use for the scope element, which wraps around
   * the element tree returned by your React components.
   *
   * @default "div"
   */
  scopeTag?: keyof JSX.IntrinsicElements
}

export default (options: Options = {}): vite.Plugin => {
  const dirCache: Record<string, string[]> = {}
  let projectRoot: string

  const postcssPlugin = getPostcssPlugin()
  const babelPlugin = getBabelPlugin(
    options.scopeTag || 'div',
    () => projectRoot,
    dirCache
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
