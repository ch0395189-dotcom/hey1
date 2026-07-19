import { useEffect } from 'react';
import { useMetaPixel } from '@/hooks/useMetaPixel';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

export const MetaPixelProvider = () => {
  const isNativeApp =
    typeof window !== 'undefined' &&
    // @ts-ignore - Capacitor injects this global at runtime on native builds
    (window as any).Capacitor?.isNativePlatform?.() === true;

  if (isNativeApp) return null;

  useMetaPixel(PIXEL_ID);
  return null;
};
