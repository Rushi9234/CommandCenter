import { describe, it, expect } from 'vitest';
import { calculateCropBounds } from './cropUtils';

describe('cropUtils - calculateCropBounds', () => {
  const viewportSize = 192;

  describe('Default Crop Mapping (Square & Rectangular images)', () => {
    it('calculates exact centered cover crop for square image at 1.0x', () => {
      const img = { naturalWidth: 1000, naturalHeight: 1000 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 0, y: 0 } });

      expect(bounds.baseScale).toBe(0.192);
      expect(bounds.renderedWidth).toBe(192);
      expect(bounds.renderedHeight).toBe(192);
      expect(bounds.srcW).toBe(1000);
      expect(bounds.srcH).toBe(1000);
      expect(bounds.srcX).toBe(0);
      expect(bounds.srcY).toBe(0);
      expect(bounds.maxPanX).toBe(0);
      expect(bounds.maxPanY).toBe(0);
    });

    it('calculates centered cover crop for landscape image (2000x1000) at 1.0x', () => {
      const img = { naturalWidth: 2000, naturalHeight: 1000 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 0, y: 0 } });

      expect(bounds.baseScale).toBe(0.192); // 192 / 1000
      expect(bounds.renderedWidth).toBe(384);
      expect(bounds.renderedHeight).toBe(192);
      expect(bounds.srcW).toBe(1000);
      expect(bounds.srcH).toBe(1000);
      expect(bounds.srcX).toBe(500); // Centered horizontally: (2000 - 1000) / 2
      expect(bounds.srcY).toBe(0);
      expect(bounds.maxPanX).toBe(96); // (384 - 192) / 2
      expect(bounds.maxPanY).toBe(0);
    });

    it('calculates centered cover crop for portrait image (1000x2000) at 1.0x', () => {
      const img = { naturalWidth: 1000, naturalHeight: 2000 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 0, y: 0 } });

      expect(bounds.baseScale).toBe(0.192);
      expect(bounds.renderedWidth).toBe(192);
      expect(bounds.renderedHeight).toBe(384);
      expect(bounds.srcW).toBe(1000);
      expect(bounds.srcH).toBe(1000);
      expect(bounds.srcX).toBe(0);
      expect(bounds.srcY).toBe(500); // Centered vertically: (2000 - 1000) / 2
      expect(bounds.maxPanX).toBe(0);
      expect(bounds.maxPanY).toBe(96);
    });
  });

  describe('Pan Directions (UP, DOWN, LEFT, RIGHT)', () => {
    it('handles dragging portrait image UP (pan Y negative) -> samples lower region', () => {
      const img = { naturalWidth: 1000, naturalHeight: 2000 };
      // Pan Y = -50 (image translated UP in viewport)
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 0, y: -50 } });

      expect(bounds.clampedPanY).toBe(-50);
      // srcY increases (moves down into natural image): 500 + 50/0.192 = 500 + 260.416...
      expect(bounds.srcY).toBeGreaterThan(500);
      expect(bounds.srcY).toBeCloseTo(760.416, 2);
    });

    it('handles dragging portrait image DOWN (pan Y positive) -> samples higher region', () => {
      const img = { naturalWidth: 1000, naturalHeight: 2000 };
      // Pan Y = +50 (image translated DOWN in viewport)
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 0, y: 50 } });

      expect(bounds.clampedPanY).toBe(50);
      // srcY decreases (moves up into natural image): 500 - 50/0.192 = 239.583...
      expect(bounds.srcY).toBeLessThan(500);
      expect(bounds.srcY).toBeCloseTo(239.583, 2);
    });

    it('handles dragging landscape image LEFT (pan X negative) -> samples right region', () => {
      const img = { naturalWidth: 2000, naturalHeight: 1000 };
      // Pan X = -40 (image translated LEFT in viewport)
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: -40, y: 0 } });

      expect(bounds.clampedPanX).toBe(-40);
      // srcX increases (moves right into natural image): 500 + 40/0.192 = 708.333...
      expect(bounds.srcX).toBeGreaterThan(500);
      expect(bounds.srcX).toBeCloseTo(708.333, 2);
    });

    it('handles dragging landscape image RIGHT (pan X positive) -> samples left region', () => {
      const img = { naturalWidth: 2000, naturalHeight: 1000 };
      // Pan X = +40 (image translated RIGHT in viewport)
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 1.0, pan: { x: 40, y: 0 } });

      expect(bounds.clampedPanX).toBe(40);
      // srcX decreases (moves left into natural image): 500 - 40/0.192 = 291.666...
      expect(bounds.srcX).toBeLessThan(500);
      expect(bounds.srcX).toBeCloseTo(291.666, 2);
    });
  });

  describe('Zoom Behavior (1.0x, 2.0x, 3.0x)', () => {
    it('scales source crop region proportionally when zoomed 2.0x', () => {
      const img = { naturalWidth: 1000, naturalHeight: 1000 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 2.0, pan: { x: 0, y: 0 } });

      expect(bounds.S).toBe(0.384); // 0.192 * 2.0
      expect(bounds.srcW).toBe(500); // 192 / 0.384
      expect(bounds.srcH).toBe(500);
      expect(bounds.srcX).toBe(250); // (1000 - 500) / 2
      expect(bounds.srcY).toBe(250);
      expect(bounds.maxPanX).toBe(96); // (384 - 192) / 2
      expect(bounds.maxPanY).toBe(96);
    });

    it('scales source crop region proportionally when zoomed 3.0x', () => {
      const img = { naturalWidth: 1200, naturalHeight: 1200 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 3.0, pan: { x: 0, y: 0 } });

      expect(bounds.srcW).toBe(400); // 1200 / 3
      expect(bounds.srcH).toBe(400);
      expect(bounds.srcX).toBe(400); // (1200 - 400) / 2
      expect(bounds.srcY).toBe(400);
    });
  });

  describe('Pan + Zoom Combination & Boundary Clamping', () => {
    it('clamps pan to maxPan bounds preventing out-of-bounds sampling', () => {
      const img = { naturalWidth: 1000, naturalHeight: 1000 };
      // Attempting to pan 500px on 2.0x zoom (maxPan is 96px)
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 2.0, pan: { x: 500, y: 500 } });

      expect(bounds.clampedPanX).toBe(96);
      expect(bounds.clampedPanY).toBe(96);
      expect(bounds.srcX).toBe(0); // Natural image left boundary
      expect(bounds.srcY).toBe(0); // Natural image top boundary
    });

    it('clamps negative pan to -maxPan bounds', () => {
      const img = { naturalWidth: 1000, naturalHeight: 1000 };
      const bounds = calculateCropBounds(img, viewportSize, { zoom: 2.0, pan: { x: -500, y: -500 } });

      expect(bounds.clampedPanX).toBe(-96);
      expect(bounds.clampedPanY).toBe(-96);
      expect(bounds.srcX).toBe(500); // W_nat - srcW = 1000 - 500 = 500
      expect(bounds.srcY).toBe(500); // H_nat - srcH = 1000 - 500 = 500
    });
  });
});
