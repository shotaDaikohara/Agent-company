// esbuildの --loader:.png=dataurl でバンドルするため、PNGはbase64 data URL文字列としてimportされる。
declare module "*.png" {
  const src: string;
  export default src;
}
