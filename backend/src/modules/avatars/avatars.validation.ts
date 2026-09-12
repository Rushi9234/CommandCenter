import sharp from 'sharp';

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  width?: number;
  height?: number;
  detectedMimeType?: string;
}

/**
 * Magic byte signatures for image formats
 */
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header, checked with WebP marker
};

/**
 * Detect actual image format from magic bytes
 */
function detectImageFormat(buffer: Buffer): string | null {
  // JPEG: starts with FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: starts with 89 50 4E 47 (‰PNG)
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // WebP: RIFF header with WebP marker
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }

  return null;
}

/**
 * Check if file appears to be SVG by content inspection
 */
function containsSvgContent(buffer: Buffer): boolean {
  try {
    const str = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    return str.includes('<svg') || str.includes('<?xml') && str.includes('svg');
  } catch {
    return false;
  }
}

/**
 * Get image dimensions using sharp
 */
async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return {
        width: metadata.width,
        height: metadata.height,
      };
    }
  } catch (error) {
    console.warn('[avatars.validation] Failed to get image dimensions:', error);
  }
  return null;
}

export const avatarValidationService = {
  /**
   * Validate uploaded avatar file
   *
   * Checks:
   * - File size ≤ 5MB
   * - MIME type is image/jpeg, image/png, or image/webp
   * - Magic bytes match claimed type (anti-spoofing)
   * - Not SVG (explicitly reject)
   * - Not animated (no GIF, animated WebP)
   * - Image dimensions ≤ 4096×4096
   * - File is actually a valid image
   */
  async validateAvatar(fileBuffer: Buffer, declaredMimeType: string): Promise<ImageValidationResult> {
    // 1. File size check (5MB = 5242880 bytes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit`,
      };
    }

    // 2. MIME type validation
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(declaredMimeType)) {
      return {
        isValid: false,
        error: `Unsupported image format: ${declaredMimeType}. Allowed: JPG, PNG, WebP`,
      };
    }

    // 3. Reject SVG explicitly
    if (declaredMimeType === 'image/svg+xml' || declaredMimeType.includes('svg')) {
      return {
        isValid: false,
        error: 'SVG images are not supported for avatars',
      };
    }

    // 4. Reject GIF (explicitly by MIME)
    if (declaredMimeType === 'image/gif' || declaredMimeType.includes('gif')) {
      return {
        isValid: false,
        error: 'Animated images (GIF, animated WebP) are not supported',
      };
    }

    // 5. SVG content detection (catch XML-based SVGs)
    if (containsSvgContent(fileBuffer)) {
      return {
        isValid: false,
        error: 'SVG or XML content detected; SVG avatars are not supported',
      };
    }

    // 6. Magic bytes validation (actual file format check)
    const detectedMimeType = detectImageFormat(fileBuffer);
    if (!detectedMimeType) {
      return {
        isValid: false,
        error: 'File does not appear to be a valid image (magic bytes check failed)',
      };
    }

    // 7. Magic bytes must match declared MIME (anti-spoofing)
    if (detectedMimeType !== declaredMimeType) {
      return {
        isValid: false,
        error: `File type mismatch: declared ${declaredMimeType} but detected ${detectedMimeType}`,
      };
    }

    // 8. Get image dimensions
    const dimensions = await getImageDimensions(fileBuffer);
    if (!dimensions) {
      return {
        isValid: false,
        error: 'Could not determine image dimensions; file may be corrupted',
      };
    }

    // 9. Dimension limits
    const MAX_DIMENSION = 4096;
    if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
      return {
        isValid: false,
        error: `Image dimensions ${dimensions.width}×${dimensions.height} exceed 4096×4096 limit`,
      };
    }

    // All checks passed
    return {
      isValid: true,
      width: dimensions.width,
      height: dimensions.height,
      detectedMimeType,
    };
  },
};
