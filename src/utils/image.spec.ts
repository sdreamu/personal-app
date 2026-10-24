import { describe, expect, it } from 'vitest';
import {
  JPEG_QUALITY,
  MAX_IMAGE_EDGE,
  OUTPUT_MIME,
  compressImageToDataUrl,
  fitWithin,
  type ImageDeps,
} from './image';

interface FakeCall {
  drawn: { width: number; height: number } | null;
  type: string | null;
  quality: number | null;
  loads: number;
}

/** 假画布 + 假解码：不依赖 canvas 包。 */
function fakeDeps(size: { width: number; height: number }): { deps: ImageDeps; calls: FakeCall } {
  const calls: FakeCall = { drawn: null, type: null, quality: null, loads: 0 };
  const deps: ImageDeps = {
    load: async () => {
      calls.loads += 1;
      return size;
    },
    createCanvas: () => ({
      draw: (_image, width, height) => {
        calls.drawn = { width, height };
      },
      toDataURL: (type, quality) => {
        calls.type = type;
        calls.quality = quality;
        return 'data:image/jpeg;base64,AAAA';
      },
    }),
  };
  return { deps, calls };
}

function fakeFile(): File {
  return new File(['fake-bytes'], 'photo.png', { type: 'image/png' });
}

describe('fitWithin：最长边等比缩放', () => {
  it('最长边不超过上限时保持原尺寸（不放大）', () => {
    expect(fitWithin({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
    expect(fitWithin({ width: MAX_IMAGE_EDGE, height: 10 })).toEqual({ width: MAX_IMAGE_EDGE, height: 10 });
  });

  it('横图/竖图都按最长边缩到 1400，宽高比保持', () => {
    expect(fitWithin({ width: 2000, height: 1000 })).toEqual({ width: 1400, height: 700 });
    expect(fitWithin({ width: 1000, height: 2000 })).toEqual({ width: 700, height: 1400 });
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: 1400, height: 1050 });
    const ratio = (size: { width: number; height: number }): number => size.width / size.height;
    expect(ratio(fitWithin({ width: 4032, height: 3024 }))).toBeCloseTo(4032 / 3024, 2);
  });

  it('支持自定义上限；极小图也不会被四舍五入成 0', () => {
    expect(fitWithin({ width: 200, height: 100 }, 100)).toEqual({ width: 100, height: 50 });
    expect(fitWithin({ width: 1000, height: 1 }, 10)).toEqual({ width: 10, height: 1 });
    expect(fitWithin({ width: 3, height: 5000 }, 10)).toEqual({ width: 1, height: 10 });
  });

  it('尺寸或上限非法时抛错', () => {
    expect(() => fitWithin({ width: 0, height: 100 })).toThrow('图片尺寸无效');
    expect(() => fitWithin({ width: 100, height: Number.NaN })).toThrow('图片尺寸无效');
    expect(() => fitWithin({ width: 100, height: 100 }, 0)).toThrow('图片尺寸无效');
  });
});

describe('compressImageToDataUrl：压缩成 JPEG data URL', () => {
  it('大图按最长边 1400 绘制，输出 image/jpeg、质量 0.72', async () => {
    const { deps, calls } = fakeDeps({ width: 3000, height: 1500 });
    const dataUrl = await compressImageToDataUrl(fakeFile(), { deps });

    expect(calls.loads).toBe(1);
    expect(calls.drawn).toEqual({ width: 1400, height: 700 });
    expect(calls.type).toBe('image/jpeg');
    expect(calls.type).toBe(OUTPUT_MIME);
    expect(calls.quality).toBe(JPEG_QUALITY);
    expect(calls.quality).toBe(0.72);
    expect(dataUrl).toBe('data:image/jpeg;base64,AAAA');
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('小图不放大：按原始尺寸绘制', async () => {
    const { deps, calls } = fakeDeps({ width: 640, height: 480 });
    await compressImageToDataUrl(fakeFile(), { deps });
    expect(calls.drawn).toEqual({ width: 640, height: 480 });
  });

  it('自定义最长边与质量生效，质量被夹到 0~1', async () => {
    const small = fakeDeps({ width: 800, height: 400 });
    await compressImageToDataUrl(fakeFile(), { deps: small.deps, maxEdge: 200, quality: 0.5 });
    expect(small.calls.drawn).toEqual({ width: 200, height: 100 });
    expect(small.calls.quality).toBe(0.5);

    const clamped = fakeDeps({ width: 800, height: 400 });
    await compressImageToDataUrl(fakeFile(), { deps: clamped.deps, quality: 2 });
    expect(clamped.calls.quality).toBe(1);
  });

  it('解码失败时把错误抛给调用方', async () => {
    const deps: ImageDeps = {
      load: async () => {
        throw new Error('图片解码失败');
      },
      createCanvas: () => ({
        draw: () => undefined,
        toDataURL: () => '',
      }),
    };
    await expect(compressImageToDataUrl(fakeFile(), { deps })).rejects.toThrow('图片解码失败');
  });
});
