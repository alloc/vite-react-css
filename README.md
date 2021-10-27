# vite-react-css

Vite plugin that enables [Scoped CSS][1] for React components (using the Shadow DOM)

[1]: https://blog.bitsrc.io/scoping-css-using-shadow-dom-a548985b73af

✨ Compatible with SSR!

## How it works

To add scoped CSS to your React component, create a file with the same name but a different extension (any of the supported CSS dialects). For example, if your component file is named `Foo.tsx`, you could create a `Foo.css` file to accompany it.

Note that your React component **must be the default export.**

Your component will be wrapped with a `<div>` which will have the "shadow root" attached to it. You can style this element by declaring a `:host {}` rule within your CSS file. From your global CSS, you can use the `.ShadowRoot` selector to stylize every shadow root added by `vite-react-css`.
