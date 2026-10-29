import type * as THREE from "three";

/**
 * Small, shared `onBeforeCompile` patches for the REAL view's surroundings and grass. Each patch is
 * a plain function over the shader being compiled, composed with `patched()`, which also gives the
 * material a stable program-cache key — so a hundred materials with the same patches still share
 * one compiled program (per-material values live in uniforms, not in the shader source).
 */

export type Shader = Parameters<THREE.Material["onBeforeCompile"]>[0];
export type ShaderPatch = (shader: Shader) => void;
export interface UniformRef {
  value: number;
}

const inject = (src: string, marker: string, add: string, before = false) => {
  if (!src.includes(marker)) return src;
  return src.replace(marker, before ? `${add}\n${marker}` : `${marker}\n${add}`);
};

/**
 * Stochastic dissolve: pixels drop out by a blue-noise-ish dither as `fade` falls below 1, so
 * the surroundings materialise with the realistic look without any of them being a transparent
 * material (no sorting, no depth-write trouble, no recompile when the fade starts or ends).
 */
export const dissolve =
  (fade: UniformRef): ShaderPatch =>
  (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = inject(shader.fragmentShader, "#include <common>", "uniform float uFade;");
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "#include <clipping_planes_fragment>",
      `if ( uFade < 0.999 ) {
        float dz = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
        if ( dz >= uFade ) discard;
      }`,
    );
  };

const NOISE_GLSL = /* glsl */ `
float sHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float sNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( sHash( i + vec3( 0, 0, 0 ) ), sHash( i + vec3( 1, 0, 0 ) ), f.x ),
                   mix( sHash( i + vec3( 0, 1, 0 ) ), sHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( sHash( i + vec3( 0, 0, 1 ) ), sHash( i + vec3( 1, 0, 1 ) ), f.x ),
                   mix( sHash( i + vec3( 0, 1, 1 ) ), sHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`;

/** Leaf dapple for foliage blobs: world-space noise breaks the smooth mounds into leafy light and dark. */
export const foliageLook: ShaderPatch = (shader) => {
  shader.vertexShader = inject(shader.vertexShader, "#include <common>", "varying vec3 vFoliageP;");
  shader.vertexShader = inject(
    shader.vertexShader,
    "#include <begin_vertex>",
    `vec4 fp = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      fp = instanceMatrix * fp;
    #endif
    vFoliageP = ( modelMatrix * fp ).xyz;`,
  );
  shader.fragmentShader = inject(shader.fragmentShader, "#include <common>", `varying vec3 vFoliageP;\n${NOISE_GLSL}`);
  shader.fragmentShader = inject(
    shader.fragmentShader,
    "#include <color_fragment>",
    `float f1 = sNoise( vFoliageP * 7.0 );
    float f2 = sNoise( vFoliageP * 19.0 + 7.1 );
    float f3 = sNoise( vFoliageP * 47.0 + 3.7 );
    float leaf = f1 * 0.45 + f2 * 0.35 + f3 * 0.2;
    diffuseColor.rgb *= 0.55 + 0.9 * leaf;
    diffuseColor.rgb += vec3( 0.055, 0.075, 0.015 ) * smoothstep( 0.72, 0.95, f2 * 0.6 + f3 * 0.4 );`,
  );
};

/**
 * The lawn: low-frequency blotches (patchy growth), faint mowing stripes and a slightly paler
 * wash toward the edge — all from the plane's own 0..1 alpha-map UVs (`size` is the plane's
 * width in metres, so the stripes are real-world width).
 */
export const lawnLook =
  (size: number, stripe: number): ShaderPatch =>
  (shader) => {
    shader.fragmentShader = inject(shader.fragmentShader, "#include <common>", `${NOISE_GLSL}`);
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "#include <map_fragment>",
      `{
        vec2 g = ( vAlphaMapUv - 0.5 ) * ${size.toFixed(2)};
        float blotch = sNoise( vec3( g * 0.22, 1.3 ) ) * 0.6 + sNoise( vec3( g * 0.9, 4.1 ) ) * 0.4;
        diffuseColor.rgb *= 0.82 + 0.34 * blotch;
        float band = smoothstep( -0.25, 0.25, sin( g.x * 3.14159265 / 0.62 ) );
        diffuseColor.rgb *= 1.0 + ( band - 0.5 ) * ${stripe.toFixed(3)};
        float wear = sNoise( vec3( g * 0.5, 9.0 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.12, 1.04, 0.74 ), smoothstep( 0.62, 0.9, wear ) * 0.55 );
      }`,
    );
  };

export interface WindUniforms {
  uTime: UniformRef;
  uWind: UniformRef;
}

/**
 * Wind in the vertex shader for instanced grass blades: a travelling wave plus slow gusts bends
 * each blade by its height squared (the root stays planted, the tip moves) *after* the instance
 * transform, so every blade leans the same way — world-space wind — whatever its own random
 * rotation. `uWind` is the sway amplitude in blade-heights; 0 means perfectly calm (reduced motion).
 */
export const windSway =
  (u: WindUniforms): ShaderPatch =>
  (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.vertexShader = inject(shader.vertexShader, "#include <common>", "uniform float uTime;\nuniform float uWind;");
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        float bladeH = length( instanceMatrix[ 1 ].xyz );
      #else
        float bladeH = 0.1;
      #endif
      vec4 wpos = modelMatrix * mvPosition;
      float tip = position.y * position.y;
      float ph = uTime * 1.9 + wpos.x * 1.35 + wpos.z * 0.95;
      float gust = 0.55 + 0.45 * sin( uTime * 0.5 + wpos.x * 0.23 + wpos.z * 0.19 );
      vec2 sway = vec2( sin( ph ) * 0.55 + sin( ph * 2.7 + 1.3 ) * 0.22 + 0.4, cos( ph * 0.8 ) * 0.35 + 0.18 );
      wpos.xz += sway * gust * uWind * tip * bladeH;
      mvPosition = viewMatrix * wpos;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };

/** Applies the patches in order and gives the material a stable cache key built from `key`. */
export function patched<T extends THREE.Material>(material: T, key: string, ...patches: ShaderPatch[]): T {
  material.onBeforeCompile = (shader) => {
    for (const p of patches) p(shader);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
