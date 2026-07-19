import { useMetaPixel } from '@/hooks/useMetaPixel';
import { Capacitor } from '@capacitor/core';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

export const MetaPixelProvider = () => {
  const isNativeApp =
    typeof window !== 'undefined' && Capacitor.isNativePlatform();

  useMetaPixel(isNativeApp ? undefined : PIXEL_ID);
  return null;
};
