/// <reference types="nativewind/types" />

declare module "*.css";

declare module "*.wasm" {
  const src: string;
  export default src;
}
