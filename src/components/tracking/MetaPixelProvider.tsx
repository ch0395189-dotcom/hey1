import { useEffect } from 'react';
import { useMetaPixel } from '@/hooks/useMetaPixel';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

export const MetaPixelProvider = () => {
  useMetaPixel(PIXEL_ID);
  return null;
};
