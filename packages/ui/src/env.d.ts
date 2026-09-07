/**
 * Ambient module declarations for static asset imports.
 * Vite resolves these at build time to hashed URLs; TypeScript needs the
 * declarations so `.png` / `.svg` / `.css` imports type-check.
 */
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
