import * as fs from 'fs'
import * as path from 'path'
import * as vite from 'vite'
import createDebug from 'debug'
import '@vitejs/plugin-react'

const debug = createDebug('react-css')

const clientEntryId = require.resolve('./client/index.jsx')

type Options = {
  /** Ensure page hydration is not broken */
  ssr?: boolean
}

export default (options: Options = {}): vite.Plugin => {
  const dirCache: Record<string, string[]> = {}
  return {
    name: 'vite-react-css',
    enforce: 'pre',
    load(id) {
      if (options.ssr && id === clientEntryId) {
        return `
          import { createStyleProvider } from './StyleProvider'
          export default createStyleProvider(true)
        `
      }
    },
    configureServer(server) {
      server.watcher?.on('all', (event, id) => {
        delete dirCache[path.dirname(id)]
      })
      // const { fileToModulesMap } = server.moduleGraph
      // this.handleHotUpdate = ({ file, modules: [cssModule] }) => {
      //   file = file.replace(styleExtensionRE, '')
      //   const jsModule =
      //     fileToModulesMap.get(file + '.tsx') ||
      //     fileToModulesMap.get(file + '.jsx')
      //   console.log('jsModule:', jsModule != null)
      //   debugger
      // }
    },
    babel: {
      plugins: [
        ({ types: t }: typeof import('@babel/core')): babel.PluginObj => ({
          visitor: {
            Program(program, state) {
              const stylePath = getStyleFilename(state.filename, dirCache)
              if (!stylePath) return
              debug(`Found styles: "${stylePath}"`)

              // If no default export exists, we check for a named export
              // whose identifier matches the file basename.
              const defaultId = path.basename(
                stylePath,
                path.extname(stylePath)
              )

              const defaultExport = program
                .get('body')
                .find(
                  stmt =>
                    stmt.isExportDefaultDeclaration() ||
                    (stmt.isExportNamedDeclaration() &&
                      isExportedIdent(
                        stmt.get('declaration') as any,
                        defaultId
                      ))
                ) as babel.NodePath<babel.types.ExportDefaultDeclaration>

              if (defaultExport) {
                // Prevent name collisions.
                const privateIdent = (name: string) => t.identifier(name + '$$')
                const StyleProvider = privateIdent('StyleProvider')
                const rawStyles = privateIdent('rawStyles')

                // The ?inline query ensures Vite doesn't inject the styles
                // for us and the import will resolve with compiled CSS.
                const styleId = './' + path.basename(stylePath) + '?inline'

                const topLevelStatements = program.node.body
                topLevelStatements.unshift(
                  // import rawStyles from "./Foo.css?inline"
                  t.importDeclaration(
                    [t.importDefaultSpecifier(rawStyles)],
                    t.stringLiteral(styleId)
                  ),
                  // import StyleProvider from "..."
                  t.importDeclaration(
                    [t.importDefaultSpecifier(StyleProvider)],
                    t.stringLiteral('/@fs/' + clientEntryId)
                  )
                )

                const defaultComponent = coerceToComponent(
                  defaultExport.get('declaration')
                )

                if (!defaultComponent) {
                  return debug(`Missing default component: "${state.filename}"`)
                }

                let transformed = false
                defaultComponent.traverse({
                  ReturnStatement(returnStmt) {
                    returnStmt.traverse({
                      JSXElement(jsxElem) {
                        transformed = true
                        jsxElem.skip()
                        jsxElem.replaceWith(
                          t.jsxElement(
                            t.jsxOpeningElement(
                              t.jsxIdentifier(StyleProvider.name),
                              [
                                t.jsxAttribute(
                                  t.jsxIdentifier('css'),
                                  t.jsxExpressionContainer(rawStyles)
                                ),
                              ]
                            ),
                            t.jsxClosingElement(
                              t.jsxIdentifier(StyleProvider.name)
                            ),
                            [t.cloneNode(jsxElem.node)]
                          )
                        )
                      },
                    })
                  },
                })

                debug(
                  transformed
                    ? `Transformed file: "${state.filename}"`
                    : `Default component does not return JSX: "${state.filename}"`
                )
              } else {
                debug(`Missing default export: "${state.filename}"`)
              }
            },
          },
        }),
      ],
    },
  }
}

const extensionRE = /\.[^\./]+$/
const reactExtensionRE = /\.[tj]sx$/
const styleExtensionRE = /\.(styl|sass|scss|css)$/

function getStyleFilename(
  filename: string | undefined,
  dirCache: Record<string, string[]>
) {
  if (!filename) return
  const ext = path.extname(filename)
  if (reactExtensionRE.test(ext)) {
    const dir = path.dirname(filename)
    try {
      const files = dirCache[dir] || (dirCache[dir] = fs.readdirSync(dir))
      const name = path.basename(filename, ext)
      const match = files.find(
        file =>
          styleExtensionRE.test(file) && name === file.replace(extensionRE, '')
      )
      if (match) {
        return path.join(dir, match)
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e
      }
    }
  }
}

function isExportedIdent(decl: babel.NodePath, name: string) {
  let ident: babel.NodePath<babel.types.Identifier>
  if (decl.isVariableDeclaration()) {
    ident = decl.get('declarations')[0].get('id') as any
  } else if (decl.isFunctionDeclaration()) {
    ident = decl.get('id') as any
  } else {
    return false
  }
  return ident.node.name === name
}

function coerceToComponent(expr: babel.NodePath): babel.NodePath | undefined {
  if (isFunction(expr)) {
    return expr
  }
  if (expr.isVariableDeclaration()) {
    return coerceToComponent(expr.get('declarations')[0].get('init') as any)
  }
  if (expr.isIdentifier()) {
    const binding = expr.scope.getBinding(expr.node.name)
    if (binding) {
      if (isFunction(binding.path)) {
        return binding.path
      }
      const { parentPath } = binding.path
      if (parentPath?.isVariableDeclarator()) {
        return coerceToComponent(parentPath.get('init') as any)
      }
    }
  }
}

const isFunction = (
  path: babel.NodePath
): path is babel.NodePath<
  babel.types.FunctionDeclaration | babel.types.ArrowFunctionExpression
> => path.isFunctionDeclaration() || path.isArrowFunctionExpression()
