/**
 * Types for the `bun:test` module the `bun test src` runner provides, so `bunx tsc --noEmit` checks the logic tests
 * that need its fake timers (`jest.useFakeTimers`) and module mocks (`mock.module`). The API is Jest's, whose types
 * the component tests already bring (`@types/jest`); only `mock.module` is Bun's own.
 */
declare module 'bun:test' {
  export const describe: typeof globalThis.describe;
  export const test: typeof globalThis.test;
  export const expect: typeof globalThis.expect;
  export const beforeEach: typeof globalThis.beforeEach;
  export const afterEach: typeof globalThis.afterEach;
  export const jest: typeof globalThis.jest;
  export const mock: { module: (specifier: string, factory: () => unknown) => void };
}
