import { useState } from 'react';
import { visionBridge, ImageContent } from '@my-agent/core';

export function useAgentVision() {
  const [capturedImages, setCapturedImages] = useState<ImageContent[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  const captureSnapshot = async (targetId?: string, caption = 'Ekran Snapshot') => {
    setIsCapturing(true);
    try {
      const img = await visionBridge.captureElementSnapshot(targetId, caption);
      setCapturedImages((prev) => [img, ...prev]);
      return img;
    } finally {
      setIsCapturing(false);
    }
  };

  const removeImage = (timestamp: number) => {
    setCapturedImages((prev) => prev.filter((img) => img.timestamp !== timestamp));
  };

  const clearImages = () => {
    setCapturedImages([]);
  };

  const getEstimatedTokens = () => {
    return capturedImages.reduce((sum, img) => sum + visionBridge.calculateApproxTokens(img), 0);
  };

  return {
    capturedImages,
    isCapturing,
    captureSnapshot,
    removeImage,
    clearImages,
    estimatedTokens: getEstimatedTokens(),
  };
}
