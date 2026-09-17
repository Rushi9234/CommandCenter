export interface CropState {
  zoom: number; // e.g. 1.0 to 3.0
  pan: { x: number; y: number }; // pan offset in viewport pixels
}

export interface ImageDimensions {
  naturalWidth: number;
  naturalHeight: number;
}

export interface CropBoundsResult {
  baseScale: number;
  S: number;
  renderedWidth: number;
  renderedHeight: number;
  displayWidth: number;
  displayHeight: number;
  maxPanX: number;
  maxPanY: number;
  clampedPanX: number;
  clampedPanY: number;
  baseLeft: number;
  baseTop: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
}

/**
 * Calculates unified crop parameters for both DOM preview and canvas export.
 * Guarantees 100% mathematical equality between what is displayed in the
 * circular crop viewport and what is drawn to the exported canvas.
 */
export function calculateCropBounds(
  img: ImageDimensions,
  viewportSize: number,
  crop: CropState
): CropBoundsResult {
  const V = viewportSize;
  const W_nat = Math.max(1, img.naturalWidth);
  const H_nat = Math.max(1, img.naturalHeight);
  const zoom = Math.max(1, crop.zoom);

  // Base cover scale factor (so image covers the viewport at 1.0x zoom)
  const baseScale = Math.max(V / W_nat, V / H_nat);

  // Total scale factor including zoom
  const S = baseScale * zoom;

  // Rendered dimensions at base scale (before CSS zoom)
  const renderedWidth = W_nat * baseScale;
  const renderedHeight = H_nat * baseScale;

  // Display dimensions after zoom
  const displayWidth = W_nat * S;
  const displayHeight = H_nat * S;

  // Maximum allowed pan magnitude to prevent blank space in viewport
  const maxPanX = Math.max(0, (displayWidth - V) / 2);
  const maxPanY = Math.max(0, (displayHeight - V) / 2);

  // Clamp user pan within maximum bounds
  const clampedPanX = Math.min(Math.max(crop.pan.x, -maxPanX), maxPanX);
  const clampedPanY = Math.min(Math.max(crop.pan.y, -maxPanY), maxPanY);

  // Source rectangle dimensions in natural image pixels
  const srcW = V / S;
  const srcH = V / S;

  // Raw source rectangle top-left coordinates in natural image pixels
  const rawSrcX = W_nat / 2 - (V / 2 + clampedPanX) / S;
  const rawSrcY = H_nat / 2 - (V / 2 + clampedPanY) / S;

  // Clamp source rectangle within natural image boundaries
  const srcX = Math.min(Math.max(0, rawSrcX), Math.max(0, W_nat - srcW));
  const srcY = Math.min(Math.max(0, rawSrcY), Math.max(0, H_nat - srcH));

  // Base DOM position for rendered <img> element before transform
  const baseLeft = (V - renderedWidth) / 2;
  const baseTop = (V - renderedHeight) / 2;

  return {
    baseScale,
    S,
    renderedWidth,
    renderedHeight,
    displayWidth,
    displayHeight,
    maxPanX,
    maxPanY,
    clampedPanX,
    clampedPanY,
    baseLeft,
    baseTop,
    srcX,
    srcY,
    srcW,
    srcH,
  };
}
