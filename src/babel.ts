import type { types as t } from '@babel/core'
import * as path from 'path'
import md5Hex = require('md5-hex')
import { debug } from './debug'
import { extensionRE, reactExtensionRE, styleExtensionRE } from './regex'

export const getBabelPlugin =
  (
    scopeType: string,
    scopeTags: string[],
    getProjectRoot: () => string,
    dirCache: Record<string, string[]>
  ) =>
  ({ types: t }: typeof import('@babel/core')): babel.PluginObj => ({
    name: 'vite-react-css',
    visitor: {
      Program(program, state) {
        if (!state.filename) return
        const stylePath = getStyleFilename(state.filename, dirCache)
        if (!stylePath) return
        debug(`Found styles: "${stylePath}"`)

        // If no default export exists, we check for a named export
        // whose identifier matches the file basename.
        const rootIdents: string[] = []
        for (
          let filePath = stylePath.replace(/\.[^./]+$/, '');
          /^[A-Z]/.test(path.basename(filePath));
          filePath = path.dirname(filePath)
        ) {
          rootIdents.unshift(path.basename(filePath) + (rootIdents[0] || ''))
        }

        const defaultExport = program
          .get('body')
          .find(
            stmt =>
              stmt.isExportDefaultDeclaration() ||
              (stmt.isExportNamedDeclaration() &&
                isExportedIdent(stmt.get('declaration') as any, rootIdents))
          ) as babel.NodePath<t.ExportDefaultDeclaration>

        if (defaultExport) {
          const relativeStylePath = path.relative(getProjectRoot(), stylePath)
          const scopeId = 's' + md5Hex(relativeStylePath).slice(0, 8)
          const styleId = './' + path.basename(stylePath) + '?scoped=' + scopeId

          const topLevelStatements = program.node.body
          topLevelStatements.unshift(
            // import "./Foo.css?scoped=xyz"
            t.importDeclaration([], t.stringLiteral(styleId))
          )

          const mainComponent = coerceToComponent(
            defaultExport.get('declaration')
          )

          if (!mainComponent) {
            return debug(`Main component not found: "${state.filename}"`)
          }

          const scopeClasses = `scoped ${scopeId}`
          const addScopeClasses = (
            prevNode: t.StringLiteral | t.JSXExpressionContainer
          ) =>
            t.isStringLiteral(prevNode)
              ? t.stringLiteral(prevNode.value + ' ' + scopeClasses)
              : t.jsxExpressionContainer(
                  t.binaryExpression(
                    '+',
                    t.logicalExpression(
                      '||',
                      prevNode.expression as any,
                      t.stringLiteral('')
                    ),
                    t.stringLiteral(' ' + scopeClasses)
                  )
                )

          const getScopeWrapper = (children: t.JSXElement['children']) =>
            t.jsxElement(
              t.jsxOpeningElement(t.jsxIdentifier(scopeType), [
                t.jsxAttribute(
                  t.jsxIdentifier('className'),
                  t.stringLiteral(scopeClasses)
                ),
              ]),
              t.jsxClosingElement(t.jsxIdentifier(scopeType)),
              children
            )

          let transformed = false
          const transformReturn = (path: babel.NodePath) => {
            const transformElement = (
              jsxElem: babel.NodePath<t.JSXElement>
            ) => {
              // Only transform root-level JSX elements.
              jsxElem.skip()

              const jsxOpenElem = jsxElem.get('openingElement')
              const tagName = jsxOpenElem.get('name').toString()

              if (scopeTags.includes(tagName)) {
                const { attributes } = jsxOpenElem.node
                for (let i = 0; i < attributes.length; i++) {
                  const attr = attributes[i]
                  if (!t.isJSXAttribute(attr)) continue
                  if (t.isJSXIdentifier(attr.name, { name: 'className' })) {
                    transformed = true
                    attr.value = addScopeClasses(attr.value as any)
                    break
                  }
                }
                if (!transformed) {
                  transformed = true
                  attributes.push(
                    t.jsxAttribute(
                      t.jsxIdentifier('className'),
                      t.stringLiteral(scopeClasses)
                    )
                  )
                }
              } else {
                transformed = true
                jsxElem.replaceWith(
                  getScopeWrapper([t.cloneNode(jsxElem.node)])
                )
              }
            }

            const transformFragment = (
              jsxFragment: babel.NodePath<t.JSXFragment>
            ) => {
              jsxFragment.skip()
              jsxFragment.replaceWith(
                getScopeWrapper(
                  jsxFragment.node.children.map(child => t.cloneNode(child))
                )
              )
            }

            if (path.isJSXFragment()) {
              transformFragment(path)
            } else if (path.isJSXElement()) {
              transformElement(path)
            } else {
              path.traverse({
                JSXFragment: transformFragment,
                JSXElement: transformElement,
                Function: path => path.skip(),
              })
            }
          }

          if (isArrowExpression(mainComponent)) {
            transformReturn(mainComponent.get('body'))
          } else {
            mainComponent.traverse({
              ReturnStatement: transformReturn,
              Function: path => path.skip(),
            })
          }

          debug(
            transformed
              ? `Transformed file: "${state.filename}"`
              : `Main component does not return JSX: "${state.filename}"`
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
      const files = dirCache[dir]
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

function isExportedIdent(decl: babel.NodePath, names: string[]) {
  let ident: babel.NodePath<t.Identifier>
  if (decl.isVariableDeclaration()) {
    ident = decl.get('declarations')[0].get('id') as any
  } else if (decl.isFunctionDeclaration()) {
    ident = decl.get('id') as any
  } else {
    return false
  }
  return names.includes(ident.node.name)
}

function coerceToComponent(expr: babel.NodePath): babel.NodePath | undefined {
  if (isFunction(expr)) {
    return expr
  }
  if (expr.isVariableDeclaration()) {
    return coerceToComponent(expr.get('declarations')[0].get('init') as any)
  }
  if (expr.isCallExpression()) {
    for (const arg of expr.get('arguments')) {
      const component = coerceToComponent(arg)
      if (component) return component
    }
  } else if (expr.isIdentifier()) {
    const binding = expr.scope.getBinding(expr.node.name)
    if (binding) {
      return coerceToComponent(
        binding.path.isVariableDeclarator()
          ? binding.path.parentPath!
          : binding.path
      )
    }
  }
}

const isFunction = (
  path: babel.NodePath
): path is babel.NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression> =>
  path.isFunctionDeclaration() || path.isArrowFunctionExpression()

const isArrowExpression = (
  path: babel.NodePath
): path is babel.NodePath<t.ArrowFunctionExpression> =>
  path.isArrowFunctionExpression() && path.get('body').isExpression()
