import * as fs from 'fs'
import * as path from 'path'
import * as vite from 'vite'
import createDebug from 'debug'
import '@vitejs/plugin-react'

const debug = createDebug('react-css')

const clientEntryId = require.resolve('./client/index.jsx')
const shadowRootId = require.resolve('./client/ShadowRoot.jsx')

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
      if (options.ssr && id === shadowRootId) {
        return `
          import { createShadowRoot } from './create'
          export default createShadowRoot(true)
        `
      }
    },
    watchChange(id) {
      delete dirCache[path.dirname(id)]
    },
    babel: {
      plugins: [
        ({ types: t }: typeof import('@babel/core')): babel.PluginObj => ({
          visitor: {
            Program(program, state) {
              const stylePath = getStyleFilename(state.filename, dirCache)
              if (!stylePath) return
              debug(`Found styles: "${stylePath}"`)

              const defaultExport = program
                .get('body')
                .find(stmt =>
                  stmt.isExportDefaultDeclaration()
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

                let defaultComponent: babel.NodePath | null | undefined

                function isFunction(
                  path: babel.NodePath
                ): path is babel.NodePath<
                  | babel.types.FunctionDeclaration
                  | babel.types.ArrowFunctionExpression
                > {
                  return (
                    path.isFunctionDeclaration() ||
                    path.isArrowFunctionExpression()
                  )
                }

                const defaultExpr = defaultExport.get('declaration')
                if (isFunction(defaultExpr)) {
                  defaultComponent = defaultExpr
                } else if (defaultExpr.isIdentifier()) {
                  const binding = defaultExpr.scope.getBinding(
                    defaultExpr.node.name
                  )
                  if (binding) {
                    if (isFunction(binding.path)) {
                      defaultComponent = binding.path
                    }
                    const parent = binding.path.parentPath
                    if (parent?.isVariableDeclaration()) {
                      //
                    }
                  }
                }

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

                // const defaultExpr = defaultExport.get('declaration')
                // defaultExpr.replaceWith(
                //   t.callExpression(privateIdent('withStyles'), [
                //     t.cloneNode(defaultExpr.node) as any,
                //     privateIdent('rawStyles'),
                //   ])
                // )

                if (transformed) {
                  debug(`Transformed file: "${state.filename}"`)
                } else {
                  debug(
                    `Default component does not return JSX: "${state.filename}"`
                  )
                }
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
