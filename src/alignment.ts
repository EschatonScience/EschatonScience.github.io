import {
  Camera,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderer,
} from "three";

export function createAlignment(canvas: HTMLCanvasElement, matrixFrame: HTMLElement) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  const uniforms = {
    resolution: { value: new Vector2(1, 1) },
    screenHeight: { value: 1 },
    matrixZone: { value: new Vector4(0.5, 0.29, 0.28, 0.14) },
  };
  const material = new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform vec2 resolution;
      uniform float screenHeight;
      uniform vec4 matrixZone;

      vec3 sceneLight(float phase) {
        return normalize(vec3(-0.045, sqrt(1.0 - phase * phase), phase));
      }

      float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(hash(cell), hash(cell + vec3(1, 0, 0)), f.x),
            mix(hash(cell + vec3(0, 1, 0)), hash(cell + vec3(1, 1, 0)), f.x),
            f.y
          ),
          mix(
            mix(hash(cell + vec3(0, 0, 1)), hash(cell + vec3(1, 0, 1)), f.x),
            mix(hash(cell + vec3(0, 1, 1)), hash(cell + vec3(1, 1, 1)), f.x),
            f.y
          ),
          f.z
        );
      }

      float clouds(vec3 p) {
        float value = 0.0;
        float weight = 0.5;
        for (int i = 0; i < 4; i++) {
          value += noise(p) * weight;
          p = p * 2.03 + vec3(7.3, 2.1, 4.7);
          weight *= 0.5;
        }
        return value;
      }

      vec3 rotateSurface(vec3 n, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return vec3(c * n.x + s * n.z, n.y, c * n.z - s * n.x);
      }

      vec3 stars(vec2 p, float scale, float threshold) {
        vec2 grid = p * scale;
        vec2 cell = floor(grid);
        // Remove only the fixed star crossing the red moon's left limb.
        if (scale == 112.0 && all(equal(cell, vec2(1112.0, 1130.0)))) return vec3(0.0);
        float seed = hash(vec3(cell, scale));
        if (seed < threshold) return vec3(0.0);
        vec2 center = vec2(
          hash(vec3(cell, 31.4)),
          hash(vec3(cell, 73.1))
        ) * 0.72 + 0.14;
        float distance = length(fract(grid) - center);
        float radius = mix(0.045, 0.11, seed * seed);
        float light = 1.0 - smoothstep(radius * 0.3, radius, distance);
        float brightness = 0.93 + 0.07 * sin(seed * 90.0);
        vec3 tint = mix(vec3(0.58, 0.64, 0.72), vec3(0.85, 0.78, 0.70), seed);
        return tint * light * brightness * mix(0.25, 0.82, seed);
      }

      vec3 filmResponse(vec3 radiance) {
        vec3 x = max(radiance, vec3(0.0));
        vec3 mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        return mix(
          mapped * 12.92,
          1.055 * pow(mapped, vec3(1.0 / 2.4)) - 0.055,
          step(vec3(0.0031308), mapped)
        );
      }

      vec3 moon(vec3 background, vec2 uv, vec2 center, float radius, float warm, float phase, float lightPhase, float reflectedLight, vec3 rimWidths, vec3 rimStrengths) {
        float aspect = resolution.x / resolution.y;
        vec2 p = (uv - center) * vec2(aspect, -1.0) / radius;
        float distance = length(p);
        float edge = 1.25 / (resolution.y * radius);

        vec3 lightDirection = sceneLight(lightPhase);
        float litArc = pow(max(dot(p / max(distance, 0.001), normalize(lightDirection.xy)), 0.0), 2.2);
        float bodyPixels = radius * screenHeight;
        float limbPixels = (distance - 1.0) * bodyPixels;

        // Each body's optical profile is expressed relative to its own visible radius.
        float coreWidth = max(0.65, bodyPixels * rimWidths.x);
        float softWidth = max(0.80, bodyPixels * rimWidths.y);
        float wideWidth = max(1.20, bodyPixels * rimWidths.z);
        float core = exp(-0.5 * pow(limbPixels / coreWidth, 2.0));
        float soft = exp(-0.5 * pow(limbPixels / softWidth, 2.0));
        float wide = exp(-0.5 * pow(limbPixels / wideWidth, 2.0));
        float cutoff = 1.0 - smoothstep(wideWidth * 2.5, wideWidth * 3.0, abs(limbPixels));
        vec3 glow = vec3(1.0, 0.93, 0.84) * core * rimStrengths.x;
        glow += vec3(1.0, 0.53, 0.32) * soft * rimStrengths.y;
        glow += vec3(0.9, 0.34, 0.22) * wide * rimStrengths.z;
        glow *= litArc * cutoff;
        if (distance > 1.0 + edge) return background + glow;

        vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
        vec3 surface = rotateSurface(normal, phase);
        float terrain = clouds(surface * mix(13.0, 7.0, warm));
        float detail = noise(surface * 68.0);
        float pits = smoothstep(0.32, 0.63, terrain + detail * 0.13);
        vec3 stone = vec3(0.24, 0.26, 0.29) * (0.43 + pits * 0.85);
        vec3 volcanic = mix(vec3(0.15, 0.045, 0.055), vec3(0.42, 0.20, 0.16), terrain);
        volcanic *= 0.62 + detail * 0.38;
        vec3 albedo = mix(stone, volcanic, warm);
        vec3 relief = vec3(
          noise(surface * 47.0 + vec3(3.0, 0.0, 0.0)),
          noise(surface * 47.0 + vec3(0.0, 7.0, 0.0)),
          noise(surface * 47.0 + vec3(0.0, 0.0, 11.0))
        ) - 0.5;
        vec3 roughNormal = normalize(normal + relief * 0.045 * normal.z);
        float incidence = dot(roughNormal, lightDirection);
        float diffuse = max(incidence, 0.0);
        float terminator = smoothstep(-0.012, 0.035, incidence);
        vec3 color = albedo * vec3(1.0, 0.91, 0.82) * pow(diffuse, 0.78) * 4.2 * terminator;

        // Planetshine reveals surface relief on the unlit face without lighting the sky.
        float fill = 0.36 + 0.64 * max(dot(normal, normalize(vec3(0.12, -0.45, 0.88))), 0.0);
        vec3 fillColor = mix(vec3(0.70, 0.76, 0.87), vec3(0.68, 0.50, 0.62), warm);
        color += albedo * fillColor * reflectedLight * fill;
        float coverage = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, distance);
        return mix(background, color, coverage) + glow;
      }

      vec3 jupiter(vec3 background, vec2 uv) {
        float aspect = resolution.x / resolution.y;
        float radius = 1.885;
        float centerY = 2.70;
        vec2 p = vec2((uv.x - 0.5) * aspect, centerY - uv.y);
        float distance = length(p);
        float altitude = distance - radius;

        float limbPixels = altitude * screenHeight;
        float broadWidth = max(24.0, screenHeight * 0.063);
        float scatterWidth = limbPixels >= 0.0 ? broadWidth : max(12.0, screenHeight * 0.020);
        float core = exp(-abs(limbPixels) / 1.8);
        float soft = exp(-0.5 * pow(limbPixels / max(12.0, screenHeight * 0.012), 2.0));
        float broad = exp(-abs(limbPixels) / scatterWidth);
        float cutoff = 1.0 - smoothstep(scatterWidth * 2.8, scatterWidth * 3.4, abs(limbPixels));
        float illumination = 0.78 + 0.22 * exp(-pow(p.x / 0.85, 2.0));
        vec3 glow = vec3(1.0, 0.93, 0.88) * core * 0.48;
        glow += vec3(1.0, 0.56, 0.39) * soft * 0.075;
        glow += vec3(0.95, 0.43, 0.30) * broad * 0.045;
        glow *= illumination * cutoff;
        if (altitude > 0.002) return background + glow;

        vec2 projected = p / radius;
        vec3 normal = vec3(projected, sqrt(max(0.0, 1.0 - dot(projected, projected))));
        vec3 surface = normal;
        float turbulence = clouds(surface * 18.0);
        float latitude = asin(clamp(surface.y, -1.0, 1.0));
        float bands = sin(latitude * 67.0 + turbulence * 8.0);
        float fineBands = sin(latitude * 174.0 + turbulence * 13.0);
        float mottling = clouds(surface * 82.0);
        vec3 color = vec3(0.27, 0.255, 0.30);
        color += bands * vec3(0.011, 0.008, 0.009);
        color += fineBands * 0.004 + (mottling - 0.47) * 0.032;
        color *= 0.85 + 0.15 * max(dot(normal, normalize(vec3(-0.12, 0.7, 0.7))), 0.0);
        float coverage = 1.0 - smoothstep(-0.0012, 0.0012, altitude);
        return mix(background, color, coverage) + glow;
      }

      void main() {
        vec2 uv = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y) / resolution;
        float aspect = resolution.x / resolution.y;
        vec2 sky = (uv - 0.5) * vec2(aspect, 1.0);

        vec3 color = vec3(0.0);
        vec2 textDistance = (uv - matrixZone.xy) / matrixZone.zw;
        if (dot(textDistance, textDistance) > 1.0) {
          color += stars(sky + 10.0, 112.0, 0.988) * 0.25;
          color += stars(sky + 34.0, 187.0, 0.998) * 0.25;
        }

        color = moon(color, uv, vec2(0.5, 0.090), 0.016, 0.0, 0.4, -0.79, 0.045,
          vec3(0.025, 0.100, 0.200), vec3(0.320, 0.060, 0.018));
        color = moon(color, uv, vec2(0.5, 0.171), 0.0090, 0.0, 2.2, -0.85, 0.025,
          vec3(0.040, 0.150, 0.280), vec3(0.280, 0.055, 0.019));
        color = moon(color, uv, vec2(0.5, 0.435), 0.0042, 0.0, 3.7, -0.87, 0.022,
          vec3(0.075, 0.145, 0.220), vec3(0.160, 0.035, 0.006));
        color = moon(color, uv, vec2(0.5, 0.583), 0.069, 1.0, 1.1, -0.82, 0.115,
          vec3(0.012, 0.100, 0.220), vec3(0.420, 0.105, 0.039));
        color = moon(color, uv, vec2(0.5, 0.724), 0.0060, 0.0, 5.4, -0.85, 0.030,
          vec3(0.055, 0.130, 0.220), vec3(0.220, 0.048, 0.011));
        color = jupiter(color, uv);

        gl_FragColor = vec4(filmResponse(color), 1.0);
      }
    `,
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  const camera = new Camera();
  scene.add(new Mesh(geometry, material));

  const renderStill = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_200_000 / (width * height)));
    renderer.setSize(Math.round(width * scale), Math.round(height * scale), false);
    uniforms.resolution.value.set(canvas.width, canvas.height);
    uniforms.screenHeight.value = height;
    if (matrixFrame) {
      const canvasBounds = canvas.getBoundingClientRect();
      const matrixBounds = matrixFrame.getBoundingClientRect();
      uniforms.matrixZone.value.set(
        (matrixBounds.left + matrixBounds.width / 2 - canvasBounds.left) / width,
        (matrixBounds.top + matrixBounds.height / 2 - canvasBounds.top) / height,
        (matrixBounds.width / 2 + 80) / width,
        (matrixBounds.height / 2 + 56) / height,
      );
    }
    renderer.render(scene, camera);
  };

  return {
    render: renderStill,
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
