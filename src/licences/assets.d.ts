/** A bundled Markdown file (Metro asset id; `md` is added to the asset extensions in metro.config.js). */
declare module '*.md' {
  const asset: number;
  export default asset;
}
