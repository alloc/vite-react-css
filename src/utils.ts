export function cacheOnDemand<T extends object>(
  obj: T,
  produce: <P extends keyof T>(key: P) => T[P]
): T {
  return new Proxy(obj, {
    get(_, key: any) {
      return key in obj ? (obj as any)[key] : ((obj as any)[key] = produce(key))
    },
  })
}
