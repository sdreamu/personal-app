/**
 * 图片压缩成 base64 data URL 的纯函数工具。
 *
 * 约束：本地单机应用，图片必须能随 JSON 备份原样导出，所以统一转成 data URL 字符串存库，
 * 禁止 Blob / objectURL（刷新即失效、且进不了备份）。
 * 无第三方依赖：尺寸计算是纯函数；解码与画布通过注入的依赖完成，
 * 因此单测可以用假画布，不需要 canvas 包。
 */

/** 压缩后最长边上限（px）。 */
export const MAX_IMAGE_EDGE = 1400;
/** JPEG 质量。 */
export const JPEG_QUALITY = 0.72;
/** 统一输出格式（体积可控且到处能显示）。 */
export const OUTPUT_MIME = 'image/jpeg';

export interface ImageSize {
  width: number;
  height: number;
}

/** 可绘制源：浏览器里是 ImageBitmap / HTMLImageElement，测试里是普通对象。 */
export interface ImageSource extends ImageSize {}

/** 画布抽象（默认实现是真实 canvas，测试可注入假画布）。 */
export interface ImageCanvas {
  /** 把源按目标尺寸画到画布左上角（会先调整画布尺寸）。 */
  draw(image: ImageSource, width: number, height: number): void;
  /** 导出 data URL。 */
  toDataURL(type: string, quality: number): string;
}

export interface ImageDeps {
  /** 解码图片，返回原始宽高（返回值同时作为可绘制源）。 */
  load(source: Blob): Promise<ImageSource>;
  /** 新建画布。 */
  createCanvas(): ImageCanvas;
}

export interface CompressImageOptions {
  /** 最长边上限，默认 MAX_IMAGE_EDGE。 */
  maxEdge?: number;
  /** JPEG 质量 0~1，默认 JPEG_QUALITY。 */
  quality?: number;
  /** 测试注入点；生产环境走浏览器默认实现。 */
  deps?: ImageDeps;
}

/**
 * 按最长边限制等比缩放（纯函数，不放大）。
 * 例：2000×1000 → 1400×700；4000×3000 → 1400×1050；300×200 → 300×200。
 */
export function fitWithin(size: ImageSize, maxEdge: number = MAX_IMAGE_EDGE): ImageSize {
  const { width, height } = size;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maxEdge) ||
    maxEdge <= 0
  ) {
    throw new Error('图片尺寸无效');
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return JPEG_QUALITY;
  return Math.min(1, Math.max(0, quality));
}

function readAsDataUrl(source: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(source);
  });
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = url;
  });
}

/** 浏览器默认实现（测试里不调用，改用注入的假依赖）。 */
export function createBrowserImageDeps(): ImageDeps {
  return {
    async load(source: Blob): Promise<ImageSource> {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(source);
        return bitmap;
      }
      const image = await loadHtmlImage(await readAsDataUrl(source));
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    createCanvas(): ImageCanvas {
      const canvas = document.createElement('canvas');
      return {
        draw(image: ImageSource, width: number, height: number): void {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('无法创建画布上下文');
          ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, width, height);
        },
        toDataURL(type: string, quality: number): string {
          return canvas.toDataURL(type, quality);
        },
      };
    },
  };
}

/**
 * 把图片压缩成 JPEG data URL：最长边 ≤ maxEdge（默认 1400）、quality 默认 0.72、保持宽高比。
 * 返回的字符串可直接存库并被 JSON 备份带走。
 */
export async function compressImageToDataUrl(
  file: Blob,
  options: CompressImageOptions = {},
): Promise<string> {
  const deps = options.deps ?? createBrowserImageDeps();
  const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE;
  const quality = clampQuality(options.quality ?? JPEG_QUALITY);
  const source = await deps.load(file);
  const target = fitWithin(source, maxEdge);
  const canvas = deps.createCanvas();
  canvas.draw(source, target.width, target.height);
  return canvas.toDataURL(OUTPUT_MIME, quality);
}
