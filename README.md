# vite-react-css

Vite plugin that emulates Scoped CSS for React components (using generated class names)

- Compatible with SSR
- Automatic code-splitting
- Hot-reloading support

```tsx
import { defineConfig } from 'vite'
import reactCss from 'vite-react-css'

// This example uses the default options.
export default defineConfig({
  plugins: [
    reactCss({
      // The tag name used by scope elements.
      scopeType: 'div',
    }),
  ],
})
```

**Note:** This plugin depends on `@vitejs/plugin-react` to work right.

&nbsp;

## How it works

To add scoped CSS to your React component, create a file with the same name but a different extension (any of the supported CSS dialects). For example, if your component file is named `Foo.tsx`, you could create a `Foo.css` file to accompany it.

Note that your React component **must** be the default export or be named the same as its file (minus the file extension, of course). Lastly, **only function components** are supported.

```jsx
// Works if module is named "Foo.jsx" or "Foo.tsx"
export const Foo = props => <div {...props} />
```

Use the `:scope` pseudo selector to stylize the element that wraps every JSX element you return from your React component.

For selectors without `:scope` in them, the unique scope class is prepended. One exception is when the selector contains an `html` selector in it (eg: `html.darkMode .foo`). In that case, the unique scope class is injected _after_ the `html` selector (eg: `html.darkMode .scopeID .foo`), so you can customize styles in relation to the class names used by the `<html>` element.

The `.scoped` class can be used within your global CSS to customize all scope elements at once.

### Scope elements

By default, a "scope element" is inserted wherever your main React component returns a JSX element. It wraps your JSX element, has the `scoped` and `{scopeId}` CSS classes, and uses the `scopeType` option as its element type.

If you define the `scopeTags` option, you can instruct `vite-react-css` to inject the `scoped` and `{scopeId}` class names into your root JSX elements, instead of inserting a scope element. For example, if `scopeTags: ["div"]` is used, and your main React component returns a `<div>` as its root element, that element will have the scope classes added to its `className` prop (or the `className` prop will be added if undefined). Any element type is valid in `scopeTags`, but make sure it can handle the `className` prop.

&nbsp;

### Quirks

- The rules within your scoped CSS will affect all descendants of your React component, even ones not created within the component itself.

&nbsp;

### Why not support `<style scoped>` in React components?

I'm open to this feature being added, but currently have no personal need for it.

If someone wants to implement it, here's how I would do it. First, use Babel to detect `<style scoped>` JSX element within TSX/JSX modules. Then, wrap the siblings of `<style scoped>` elements with a `<div className="scoped {scopeId}">` tag and remove the `<style scoped>` element. Inject an `import from "./{moduleBasename}.css"` declaration into the TSX/JSX module. Then use `resolveId` and `load` plugin hooks to provide the `.css` import generated from the extracted `<style scoped>` CSS text.

As a bonus, we could support dynamic CSS (eg: using JS variable interpolation) inside the `<style scoped>` element if we use a special `ScopedStyles` component instead of a simple `<div>` tag. The `ScopedStyles` component would extract the `<style scoped>` JSX element from its `children` prop and manage an `HTMLStyleElement` injected into the `<head>` DOM element. Each instance of a React component using `ScopedStyles` would have its own `<style>` element. Personally, I think supporting dynamic CSS within `<style scoped>` would be overkill, and it's better to use something like [ui-box](https://github.com/segmentio/ui-box) or the plain ol' `style` prop when you need dynamic styles.
