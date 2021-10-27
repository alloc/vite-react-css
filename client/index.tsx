// import { ComponentType, forwardRef } from 'react'
import ShadowRoot from './ShadowRoot'

// TODO: try <link> tag
// export default function withStyles(
//   Component: ComponentType,
//   rawStyles: string
// ) {
//   return forwardRef(function StyleProvider(props: any, ref: any) {
//     return (
//       <ShadowRoot ref={ref}>
//         <style type="text/css">{rawStyles}</style>
//         <Component {...props} />
//       </ShadowRoot>
//     )
//   })
// }

export default function StyleProvider(props: { css: string; children: any }) {
  return (
    <ShadowRoot>
      <style type="text/css">{props.css}</style>
      {props.children}
    </ShadowRoot>
  )
}
