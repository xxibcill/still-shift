import {
  coverFit,
  evaluateFrame,
  PREVIEW_LIMITS,
  type PreviewScene,
} from "./scene.ts";

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
uniform sampler2D u_depth;
uniform vec2 u_cover;
uniform float u_overscan;
uniform float u_scale;
uniform float u_depthStrength;
void main() {
  float depth = texture(u_depth, a_uv).r;
  if (!(depth >= 0.0 && depth <= 1.0)) depth = 0.5;
  float parallax = 1.0 / (1.0 - depth * u_depthStrength);
  vec2 position = a_position * u_cover * (1.0 + u_overscan) * u_scale * parallax;
  gl_Position = vec4(position, depth * u_depthStrength, 1.0);
  v_uv = a_uv;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_source;
void main() {
  outColor = texture(u_source, v_uv);
}`;

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext): WebGLProgram => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) ?? "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
};

const buildMesh = (): { vertices: Float32Array; indices: Uint16Array } => {
  const { gridColumns: columns, gridRows: rows } = PREVIEW_LIMITS;
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 4);
  const indices = new Uint16Array(columns * rows * 6);
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const v = row / rows;
      const offset = (row * (columns + 1) + column) * 4;
      vertices.set([u * 2 - 1, v * 2 - 1, u, v], offset);
    }
  }
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lower = row * (columns + 1) + column;
      const upper = lower + columns + 1;
      indices.set(
        [lower, lower + 1, upper, lower + 1, upper + 1, upper],
        index,
      );
      index += 6;
    }
  }
  return { vertices, indices };
};

const uploadTexture = (
  gl: WebGL2RenderingContext,
  image: HTMLImageElement,
  unit: number,
): WebGLTexture => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create WebGL texture");
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
};

export type WebGLPreview = {
  renderFrame(frameIndex: number): void;
  dispose(): void;
};

export const createWebGLPreview = (
  canvas: HTMLCanvasElement,
  scene: PreviewScene,
  source: HTMLImageElement,
  depth: HTMLImageElement,
): WebGLPreview => {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL2 is required for the depth preview");
  const program = createProgram(gl);
  const mesh = buildMesh();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  const vertexArray = gl.createVertexArray();
  if (!vertexBuffer || !indexBuffer || !vertexArray)
    throw new Error("Unable to allocate preview mesh");
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uvLocation = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
  gl.useProgram(program);
  const sourceTexture = uploadTexture(gl, source, 0);
  const depthTexture = uploadTexture(gl, depth, 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_source"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_depth"), 1);
  const cover = coverFit(
    scene.source.width,
    scene.source.height,
    scene.canvas.width,
    scene.canvas.height,
  );
  gl.uniform2f(gl.getUniformLocation(program, "u_cover"), cover.x, cover.y);
  gl.uniform1f(
    gl.getUniformLocation(program, "u_overscan"),
    scene.motion.overscan,
  );
  gl.uniform1f(
    gl.getUniformLocation(program, "u_depthStrength"),
    scene.motion.depthStrength,
  );
  const scaleLocation = gl.getUniformLocation(program, "u_scale");
  gl.clearColor(0.08, 0.08, 0.08, 1);
  return {
    renderFrame(frameIndex) {
      const frame = evaluateFrame(scene, frameIndex);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.uniform1f(scaleLocation, frame.scale);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    },
    dispose() {
      gl.deleteTexture(sourceTexture);
      gl.deleteTexture(depthTexture);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    },
  };
};
