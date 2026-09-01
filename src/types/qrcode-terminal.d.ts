declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }
  const qrcode: {
    generate(input: string, opts?: GenerateOptions, cb?: (ascii: string) => void): void;
    setErrorLevel(level: "L" | "M" | "Q" | "H"): void;
  };
  export default qrcode;
}
