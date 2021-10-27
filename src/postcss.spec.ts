import endent from 'endent'
import postcss from 'postcss'
import { getPostcssPlugin } from './postcss'

describe('postcss plugin', () => {
  const plugin = getPostcssPlugin()
  const processor = postcss([plugin])
  const process = (css: string) =>
    endent(
      processor
        .process(css, { from: 'foo.css?scoped=abc' })
        .sync()
        .root.toString() as any
    )

  it('replaces :scope selector', () => {
    const css = process(`
      :scope {}
      :scope.foo {}
      :scope:not(.foo) {}
      .foo :scope {}
    `)

    expect(css).toMatchInlineSnapshot(`
      ".abc {}
      .abc.foo {}
      .abc:not(.foo) {}
      .foo .abc {}"
    `)
  })

  it('respects <html> tag selector', () => {
    const css = process(`
      html.foo {}
      html.foo .bar {}
      html.foo, html.bar {}
    `)

    expect(css).toMatchInlineSnapshot(`
      "html.foo .abc {}
      html.foo .abc .bar {}
      html.foo .abc, html.bar .abc {}"
    `)
  })

  it('prepends :scope to other selectors', () => {
    const css = process(`
      .foo {}
      .foo .bar {}
      .foo, .bar {}
    `)

    expect(css).toMatchInlineSnapshot(`
      ".abc .foo {}
      .abc .foo .bar {}
      .abc .foo, .abc .bar {}"
    `)
  })
})
