const MEDIAPIPE_VERSION = '1.0.1';
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';

type MaskLike = {
  width: number;
  height: number;
  getAsUint8Array: () => Uint8Array;
  getAsFloat32Array: () => Float32Array;
  close: () => void;
};

type ImageSegmenterLike = {
  segmentForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
    callback: (result: {
      categoryMask?: MaskLike;
      confidenceMasks?: MaskLike[];
    }) => void
  ) => void;
  close: () => void;
};

export type BackgroundBlurDrawOptions = {
  blurEnabled: boolean;
  blurAmount: number;
  brightness: number;
  contrast: number;
  saturation: number;
  mirror?: boolean;
  backgroundImage?: HTMLImageElement | null;
  /** Pixels to shrink the person cutout; higher removes more of the ghost outline. */
  edgeChoke?: number;
  /** Digital zoom, 1 = full frame. */
  zoom?: number;
};

function colorFilter(brightness: number, contrast: number, saturation: number): string {
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
}

function applyMirror(ctx: CanvasRenderingContext2D, width: number, mirrored?: boolean): void {
  if (!mirrored) return;
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
}

function applyCameraZoom(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom?: number
): void {
  const scale = Math.min(3, Math.max(1, zoom ?? 1));
  if (scale <= 1.001) return;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
}

function isUsableImage(image: HTMLImageElement | null | undefined): image is HTMLImageElement {
  return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas.getContext('2d');
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function centerMinusBorder(values: ArrayLike<number>, width: number, height: number, scale: number): number {
  const insetX = Math.max(1, Math.floor(width * 0.28));
  const insetY = Math.max(1, Math.floor(height * 0.22));
  let centerSum = 0;
  let centerCount = 0;
  let borderSum = 0;
  let borderCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = values[y * width + x] * scale;
      const inCenter = x >= insetX && x < width - insetX && y >= insetY && y < height - insetY;
      if (inCenter) {
        centerSum += value;
        centerCount += 1;
      } else {
        borderSum += value;
        borderCount += 1;
      }
    }
  }
  if (!centerCount || !borderCount) return 0;
  return (centerSum / centerCount) - (borderSum / borderCount);
}

function centerIsHigher(values: ArrayLike<number>, width: number, height: number, scale: number): boolean {
  return centerMinusBorder(values, width, height, scale) >= 0;
}

function erodeCanvas(
  source: HTMLCanvasElement,
  dest: CanvasRenderingContext2D,
  radius: number
): void {
  const width = dest.canvas.width;
  const height = dest.canvas.height;
  dest.globalCompositeOperation = 'source-over';
  dest.clearRect(0, 0, width, height);
  dest.drawImage(source, 0, 0, width, height);
  dest.globalCompositeOperation = 'destination-in';
  const r = Math.max(1, radius);
  const offsets: Array<[number, number]> = [
    [-r, 0], [r, 0], [0, -r], [0, r],
    [-r, -r], [r, -r], [-r, r], [r, r],
  ];
  for (const [dx, dy] of offsets) {
    dest.drawImage(source, dx, dy, width, height);
  }
  dest.globalCompositeOperation = 'source-over';
}

function defringePerson(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (width * height > 1_200_000) return;
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const source = new Uint8ClampedArray(pixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      const alpha = source[index + 3];
      if (alpha === 0 || alpha >= 250) continue;
      if (alpha < 36) {
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
        pixels[index + 3] = 0;
        continue;
      }
      let bestAlpha = alpha;
      let red = source[index];
      let green = source[index + 1];
      let blue = source[index + 2];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = ((y + dy) * width + (x + dx)) * 4;
          const neighborAlpha = source[neighbor + 3];
          if (neighborAlpha > bestAlpha) {
            bestAlpha = neighborAlpha;
            red = source[neighbor];
            green = source[neighbor + 1];
            blue = source[neighbor + 2];
          }
        }
      }
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = bestAlpha >= 240 ? 255 : alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawPlainFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  options: BackgroundBlurDrawOptions
): void {
  ctx.save();
  applyMirror(ctx, width, options.mirror);
  applyCameraZoom(ctx, width, height, options.zoom);
  try {
    ctx.filter = colorFilter(options.brightness, options.contrast, options.saturation);
  } catch {
    ctx.filter = 'none';
  }
  ctx.drawImage(video, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.restore();
}

export class WebcamBackgroundBlurEngine {
  private segmenter: ImageSegmenterLike | null = null;
  private loadPromise: Promise<void> | null = null;
  private lastTimestamp = 0;
  private maskImage: ImageData | null = null;
  private smoothed: Float32Array | null = null;
  private highValuesArePerson: boolean | null = null;
  private readonly blurCanvas: HTMLCanvasElement;
  private readonly personCanvas: HTMLCanvasElement;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly featherCanvas: HTMLCanvasElement;
  private readonly edgeCanvas: HTMLCanvasElement;

  constructor() {
    this.blurCanvas = document.createElement('canvas');
    this.personCanvas = document.createElement('canvas');
    this.maskCanvas = document.createElement('canvas');
    this.featherCanvas = document.createElement('canvas');
    this.edgeCanvas = document.createElement('canvas');
  }

  get ready(): boolean {
    return this.segmenter !== null;
  }

  async ensure(): Promise<void> {
    if (this.segmenter) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadSegmenter();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  drawFrame(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    options: BackgroundBlurDrawOptions
  ): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    if (width < 1 || height < 1 || video.readyState < 2) return;

    const useBrandImage = isUsableImage(options.backgroundImage);
    const useBlur = !!options.blurEnabled && !!this.segmenter && options.blurAmount >= 1;
    if ((!useBrandImage && !useBlur) || !this.segmenter) {
      drawPlainFrame(ctx, video, width, height, options);
      return;
    }

    this.updateMask(video);

    const filter = colorFilter(options.brightness, options.contrast, options.saturation);
    ctx.filter = 'none';

    if (useBrandImage) {
      drawCoverImage(ctx, options.backgroundImage, width, height);
    } else {
      const blurW = Math.max(1, Math.round(width / 2));
      const blurH = Math.max(1, Math.round(height / 2));
      const blurCtx = ensureCanvasSize(this.blurCanvas, blurW, blurH);
      if (!blurCtx) {
        drawPlainFrame(ctx, video, width, height, options);
        return;
      }
      blurCtx.save();
      applyCameraZoom(blurCtx, blurW, blurH, options.zoom);
      blurCtx.filter = `${filter} blur(${Math.max(2, options.blurAmount)}px)`;
      blurCtx.drawImage(video, 0, 0, blurW, blurH);
      blurCtx.restore();
      ctx.save();
      applyMirror(ctx, width, options.mirror);
      ctx.drawImage(this.blurCanvas, 0, 0, width, height);
      ctx.restore();
    }

    if (!this.maskImage) return;

    const maskCtx = ensureCanvasSize(this.maskCanvas, this.maskImage.width, this.maskImage.height);
    const personCtx = ensureCanvasSize(this.personCanvas, width, height);
    const featherCtx = ensureCanvasSize(this.featherCanvas, width, height);
    const edgeCtx = ensureCanvasSize(this.edgeCanvas, width, height);
    if (!maskCtx || !personCtx || !featherCtx || !edgeCtx) return;

    maskCtx.putImageData(this.maskImage, 0, 0);

    edgeCtx.globalCompositeOperation = 'source-over';
    edgeCtx.imageSmoothingEnabled = true;
    edgeCtx.imageSmoothingQuality = 'high';
    edgeCtx.clearRect(0, 0, width, height);
    edgeCtx.drawImage(this.maskCanvas, 0, 0, width, height);

    const choke = Math.max(0, Math.round(options.edgeChoke ?? 3));
    if (choke > 0) {
      erodeCanvas(this.edgeCanvas, featherCtx, choke);
    } else {
      featherCtx.globalCompositeOperation = 'source-over';
      featherCtx.clearRect(0, 0, width, height);
      featherCtx.drawImage(this.edgeCanvas, 0, 0, width, height);
    }

    edgeCtx.clearRect(0, 0, width, height);
    const featherPx = choke > 6 ? 0.75 : choke > 0 ? 1.25 : 2;
    edgeCtx.filter = `blur(${featherPx}px)`;
    edgeCtx.drawImage(this.featherCanvas, 0, 0, width, height);
    edgeCtx.filter = 'none';

    personCtx.globalCompositeOperation = 'source-over';
    personCtx.clearRect(0, 0, width, height);
    personCtx.save();
    applyCameraZoom(personCtx, width, height, options.zoom);
    try {
      personCtx.filter = filter;
    } catch {
      personCtx.filter = 'none';
    }
    personCtx.drawImage(video, 0, 0, width, height);
    personCtx.filter = 'none';
    personCtx.restore();
    personCtx.save();
    applyCameraZoom(personCtx, width, height, options.zoom);
    personCtx.globalCompositeOperation = 'destination-in';
    personCtx.drawImage(this.edgeCanvas, 0, 0, width, height);
    personCtx.restore();
    personCtx.globalCompositeOperation = 'source-over';
    defringePerson(personCtx, width, height);

    ctx.save();
    applyMirror(ctx, width, options.mirror);
    ctx.drawImage(this.personCanvas, 0, 0, width, height);
    ctx.restore();
  }

  close(): void {
    try { this.segmenter?.close(); } catch { /* ignore */ }
    this.segmenter = null;
    this.maskImage = null;
    this.smoothed = null;
    this.highValuesArePerson = null;
  }

  private async loadSegmenter(): Promise<void> {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    const options = {
      baseOptions: {
        modelAssetPath: SELFIE_MODEL,
        delegate: 'GPU' as const,
      },
      runningMode: 'VIDEO' as const,
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    };
    try {
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, options);
    } catch {
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }

  private updateMask(video: HTMLVideoElement): void {
    if (!this.segmenter) return;
    let timestamp = performance.now();
    if (timestamp <= this.lastTimestamp) {
      timestamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = timestamp;
    try {
      this.segmenter.segmentForVideo(video, timestamp, (result) => {
        this.ingestMaskResult(result);
        result.categoryMask?.close();
        result.confidenceMasks?.forEach((mask) => {
          try { mask.close(); } catch { /* ignore */ }
        });
      });
    } catch {
      /* keep previous mask */
    }
  }

  private ingestMaskResult(result: {
    categoryMask?: MaskLike;
    confidenceMasks?: MaskLike[];
  }): void {
    const confidence = result.confidenceMasks;
    if (confidence && confidence.length > 0) {
      let best = confidence[0];
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const mask of confidence) {
        const values = mask.getAsFloat32Array();
        const score = centerMinusBorder(values, mask.width, mask.height, 1);
        if (score > bestScore) {
          best = mask;
          bestScore = score;
        }
      }
      this.writePersonMask(best.getAsFloat32Array(), best.width, best.height, 1);
      return;
    }
    const category = result.categoryMask;
    if (!category) return;
    this.writePersonMask(category.getAsUint8Array(), category.width, category.height, 1 / 255);
  }

  private writePersonMask(
    values: ArrayLike<number>,
    width: number,
    height: number,
    scale: number
  ): void {
    const count = width * height;
    if (!this.maskImage || this.maskImage.width !== width || this.maskImage.height !== height) {
      this.maskImage = new ImageData(width, height);
      this.smoothed = new Float32Array(count);
      this.highValuesArePerson = null;
    }
    if (!this.smoothed || this.smoothed.length !== count) {
      this.smoothed = new Float32Array(count);
    }

    if (this.highValuesArePerson === null) {
      this.highValuesArePerson = centerIsHigher(values, width, height, scale);
    }

    const personIsHigh = this.highValuesArePerson;
    const dest = this.maskImage.data;
    const previous = this.smoothed;
    for (let i = 0; i < count; i++) {
      let person = values[i] * scale;
      if (personIsHigh === false) person = 1 - person;
      // Soft cut: keep hair/shoulders, push furniture/walls to background.
      const contrasted = smoothstep(0.38, 0.78, person);
      const mixed = previous[i] * 0.55 + contrasted * 0.45;
      previous[i] = mixed;
      const alpha = Math.round(mixed * 255);
      const offset = i * 4;
      dest[offset] = 255;
      dest[offset + 1] = 255;
      dest[offset + 2] = 255;
      dest[offset + 3] = alpha;
    }
  }
}
