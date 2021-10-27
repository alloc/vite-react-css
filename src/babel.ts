import * as fs from 'fs'
import * as path from 'path'
import md5Hex = require('md5-hex')
import { debug } from './debug'
import { extensionRE, reactExtensionRE, styleExtensionRE } from './regex'

export const getBabelPlugin =
  (
    scopeTag: string,
    getProjectRoot: () => string,
    dirCache: Record<string, string[]>
  ) =>
  ({ types: t }: typeof import('@babel/core')): babel.PluginObj => ({
    visitor: {
      Program(program, state) {
        const stylePath = getStyleFilename(state.filename, dirCache)
        if (!stylePath) return
        debug(`Found styles: "${stylePath}"`)

        // If no default export exists, we check for a named export
        // whose identifier matches the file basename.
        const defaultId = path.basename(stylePath, path.extname(stylePath))

        const defaultExport = program
          .get('body')
          .find(
            stmt =>
              stmt.isExportDefaultDeclaration() ||
              (stmt.isExportNamedDeclaration() &&
                isExportedIdent(stmt.get('declaration') as any, defaultId))
          ) as babel.NodePath<babel.types.ExportDefaultDeclaration>

        if (defaultExport) {
          const relativeStylePath = path.relative(getProjectRoot(), stylePath)
          const scopeId = 's' + md5Hex(relativeStylePath).slice(0, 8)
          const styleId = './' + path.basename(stylePath) + '?scoped=' + scopeId

          const topLevelStatements = program.node.body
          topLevelStatements.unshift(
            // import "./Foo.css?scoped=xyz"
            t.importDeclaration([], t.stringLiteral(styleId))
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
                      t.jsxOpeningElement(t.jsxIdentifier(scopeTag), [
                        t.jsxAttribute(
                          t.jsxIdentifier('className'),
                          t.stringLiteral(`scoped ${scopeId}`)
                        ),
                      ]),
                      t.jsxClosingElement(t.jsxIdentifier(scopeTag)),
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
  })

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
