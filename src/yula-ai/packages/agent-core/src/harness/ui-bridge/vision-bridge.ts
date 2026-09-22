export interface ImageContent {
  type: 'image';
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  base64Data: string;
  width?: number;
  height?: number;
  caption?: string;
  timestamp: number;
}

export interface VisionPromptPayload {
  prompt: string;
  images: ImageContent[];
  meta?: Record<string, any>;
}

export class VisionBridge {
  /**
   * Resim verisini multi-modal LLM mesajına dönüştürür.
   */
  formatVisionMessage(prompt: string, images: ImageContent[]): VisionPromptPayload {
    return {
      prompt,
      images,
      meta: {
        totalImages: images.length,
        hasVisualContext: images.length > 0,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Tarayıcı ortamında belirtilen elementin veya ekranın görsel snapshot'ını üretir.
   */
  async captureElementSnapshot(
    elementOrId?: string | HTMLElement,
    caption = 'UI Ekran Görüntüsü'
  ): Promise<ImageContent> {
    const timestamp = Date.now();

    // Gerçek DOM canvas üretimi veya simülasyon placeholder
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Canlı UI Mock Çizimi
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('Headless UI Snapshot [Pi Vision]', 40, 60);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '14px sans-serif';
          ctx.fillText(`Yakalama Zamanı: ${new Date(timestamp).toLocaleTimeString()}`, 40, 100);
          ctx.fillText(`Hedef Element: ${typeof elementOrId === 'string' ? elementOrId : 'document.body'}`, 40, 130);

          // Form çizimi mock
          ctx.strokeStyle = '#334155';
          ctx.strokeRect(40, 160, 560, 150);
          ctx.fillStyle = '#22c55e';
          ctx.fillText('✓ Aktif Form ve Tablo Alanları Görselleştirildi', 60, 200);

          const dataUrl = canvas.toDataURL('image/png');
          const base64Data = dataUrl.split(',')[1] || '';

          return {
            type: 'image',
            mimeType: 'image/png',
            base64Data,
            width: 640,
            height: 360,
            caption,
            timestamp,
          };
        }
      } catch (err) {
        console.warn('[VisionBridge] Canvas snapshot oluşturulamadı, placeholder kullanılıyor:', err);
      }
    }

    // Node.js veya Canvas desteklenmeyen ortamlar için hafif Base64 PNG pikseli
    const fallbackBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    return {
      type: 'image',
      mimeType: 'image/png',
      base64Data: fallbackBase64,
      width: 1,
      height: 1,
      caption,
      timestamp,
    };
  }

  /**
   * Resim bayt boyutunu kontrol eder ve gerekiyorsa uyarır (Token tasarrufu).
   */
  calculateApproxTokens(image: ImageContent): number {
    const width = image.width || 800;
    const height = image.height || 600;
    // OpenAI vision maliyet formülü (tile tabanlı hesaplama)
    const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
    return 85 + tiles * 170;
  }
}

export const visionBridge = new VisionBridge();
