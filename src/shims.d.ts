declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module 'react' {
  export const StrictMode: any;
  export function useEffect(effect: () => void | (() => void) | Promise<void>, deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export function useState<T>(initialState: T): [T, (value: T | ((prev: T) => T)) => void];
  const React: any;
  export default React;
}

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(node: any): void;
  };
}

declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}

declare module 'recharts' {
  export const Bar: any;
  export const ComposedChart: any;
  export const Customized: any;
  export const Line: any;
  export const ReferenceLine: any;
  export const ResponsiveContainer: any;
  export const Scatter: any;
  export const Tooltip: any;
  export const XAxis: any;
  export const YAxis: any;
}

interface ImportMeta {
  glob(pattern: string, options?: Record<string, unknown>): Record<string, unknown>;
}
