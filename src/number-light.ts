export function createNumberLight(matrix: HTMLTableElement) {
  const numbers = Array.from(matrix.querySelectorAll<HTMLElement>(".matrix-number"));
  const lightDrift = 0.045;
  const face = [241, 234, 222];
  const light = [90, 52, 18];
  let previousLayout = "";

  const lightNumbers = () => {
    const layout = numbers.map((number) => {
      const bounds = number.getBoundingClientRect();
      const baseline = number.querySelector<HTMLElement>(".matrix-baseline")!;
      const style = getComputedStyle(number);
      return {
        number,
        width: bounds.width,
        height: bounds.height,
        baseline: baseline.getBoundingClientRect().top - bounds.top,
        font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        value: number.textContent!.trim(),
      };
    });
    const layoutKey = layout.map(({ width, height, baseline, font }) =>
      `${width}:${height}:${baseline}:${font}`).join(";");
    if (layoutKey === previousLayout || layout.some(({ width, height }) => !width || !height)) return;
    previousLayout = layoutKey;

    for (const glyph of layout) {
      const canvas = document.createElement("canvas");
      // At most 24 * 256 * 160 sampled pixels; these textures contain color,
      // while background-clip:text supplies the original native glyph coverage.
      canvas.width = Math.min(256, Math.ceil(glyph.width * 4));
      canvas.height = Math.min(160, Math.ceil(glyph.height * 4));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      const scaleX = canvas.width / glyph.width;
      const scaleY = canvas.height / glyph.height;
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      context.font = glyph.font;
      context.textBaseline = "alphabetic";
      context.fillStyle = "white";
      context.fillText(glyph.value, 0, glyph.baseline);
      const mask = context.getImageData(0, 0, canvas.width, canvas.height).data;

      const rayDrift = lightDrift * scaleX / scaleY;
      const padding = Math.ceil(canvas.height * rayDrift) + 2;
      const rayCount = canvas.width + 2 * padding;
      const firstHit = new Float32Array(rayCount).fill(Infinity);
      // Rays travel down and slightly right, opposite the scene's overhead light.
      // A minimum over opaque samples records only the exposed first surface.
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (mask[(y * canvas.width + x) * 4 + 3] < 128) continue;
          const ray = Math.round(x - y * rayDrift) + padding;
          firstHit[ray] = Math.min(firstHit[ray], y);
        }
      }

      const firstExit = new Float32Array(rayCount).fill(canvas.height);
      for (let ray = 0; ray < rayCount; ray++) {
        if (!Number.isFinite(firstHit[ray])) continue;
        for (let y = firstHit[ray] + 1; y < canvas.height; y++) {
          const x = Math.round(ray - padding + y * rayDrift);
          if (x < 0 || x >= canvas.width || mask[(y * canvas.width + x) * 4 + 3] < 16) {
            firstExit[ray] = y;
            break;
          }
        }
      }

      const incidence = new Float32Array(rayCount);
      const radius = Math.max(1, Math.round(scaleX));
      for (let ray = 0; ray < rayCount; ray++) {
        if (!Number.isFinite(firstHit[ray])) continue;
        let left = Math.max(0, ray - radius);
        let right = Math.min(rayCount - 1, ray + radius);
        while (left < ray && !Number.isFinite(firstHit[left])) left++;
        while (right > ray && !Number.isFinite(firstHit[right])) right--;
        const slope = left === right ? 0 :
          ((firstHit[right] - firstHit[left]) / scaleY) / ((right - left) / scaleX);
        const normalX = slope;
        const normalY = -(1 + lightDrift * slope);
        incidence[ray] = Math.max(0, (-lightDrift * normalX - normalY) /
          (Math.hypot(normalX, normalY) * Math.hypot(lightDrift, 1)));
      }

      const texture = context.createImageData(canvas.width, canvas.height);
      const bloom = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const ray = Math.round(x - y * rayDrift) + padding;
          const depth = Math.max(0, (y - firstHit[ray]) / scaleY);
          const illumination = Number.isFinite(firstHit[ray]) && y < firstExit[ray] && depth < 4.2 ?
            incidence[ray] * Math.exp(-Math.pow(depth / 2.0, 2)) : 0;
          const pixel = (y * canvas.width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            texture.data[pixel + channel] = face[channel] + light[channel] * illumination;
          }
          texture.data[pixel + 3] = 255;
          bloom.data[pixel] = 255;
          bloom.data[pixel + 1] = 178;
          bloom.data[pixel + 2] = 95;
          bloom.data[pixel + 3] = mask[pixel + 3] * illumination;
        }
      }
      context.putImageData(texture, 0, 0);
      glyph.number.style.setProperty("--contour-light", `url("${canvas.toDataURL("image/png")}")`);
      context.putImageData(bloom, 0, 0);
      glyph.number.style.setProperty("--contour-glow", `url("${canvas.toDataURL("image/png")}")`);
      glyph.number.classList.add("matrix-number-lit");
    }
  };

  return lightNumbers;
}
