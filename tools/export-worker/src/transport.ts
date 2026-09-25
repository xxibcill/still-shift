export type FrameTransport = "raw_rgba" | "png_pipe" | "jpeg_pipe";

export const assertNever = (value: never): never => {
  throw new Error(`Unsupported frame transport: ${String(value)}`);
};
