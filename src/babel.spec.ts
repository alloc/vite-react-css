import * as babel from '@babel/core'
import { getBabelPlugin } from './babel'

describe('getBabelPlugin', () => {
  const root = '/foo'
  const plugin = getBabelPlugin('div', ['Box'], () => root, {
    [root]: ['Foo.tsx', 'Foo.css'],
  })
  const transform = (code: TemplateStringsArray) =>
    babel.transformSync(code.raw.join(''), {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx'] },
      filename: root + '/Foo.tsx',
    }).code

  describe('scopeTags', () => {
    it('mutates the className attribute if one exists', () => {
      expect([
        transform`
          export default () => (
            <Box className="Foo" />
          )
        `,
        transform`
          export default (props) => (
            <Box className={props.className} />
          )
        `,
      ]).toMatchSnapshot()
    })

    it('adds a className attribute otherwise', () => {
      expect([
        transform`
          export default () => (
            <Box />
          )
        `,
      ]).toMatchSnapshot()
    })

    // It dangerously overwrites the "className" attribute
    // that may be defined within a spread attribute.
    it('does not account for spread attributes', () => {
      expect([
        transform`
          export default () => (
            <Box {...props} />
          )
        `,
      ]).toMatchSnapshot()
    })
  })

  describe('main component', () => {
    it('can be default export as arrow function', () => {
      expect([
        transform`
          export default () => (
            <span>Hello world</span>
          )
        `,
        transform`
          export default () => {
            return <span>Hello world</span>
          }
        `,
      ]).toMatchSnapshot()
    })

    it('can be default export as identifier', () => {
      expect([
        transform`
          const Foo = () => (
            <span>Hello world</span>
          )
          export default Foo
        `,
      ]).toMatchSnapshot()
    })

    it('can be default export as function declaration', () => {
      expect([
        transform`
          export default function Foo() {
            return <span>Hello world</span>
          }
        `,
      ]).toMatchSnapshot()
    })

    it('can be default export as HOC-wrapped function', () => {
      expect([
        transform`
          export default wrap(() => (
            <span>Hello world</span>
          ))
        `,
      ]).toMatchSnapshot()
    })

    it('can be a named export if named after file basename', () => {
      expect([
        transform`
          export const Foo = wrap(() => (
            <span>Hello world</span>
          ))
        `,
      ]).toMatchSnapshot()
    })
  })
})
