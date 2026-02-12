import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}

// Get cookie value
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match?.[2];
}

// Initialize Meta Pixel (client-side)
function initPixel(pixelId: string) {
  if (window.fbq) return;

  const n: any = (window.fbq = function (...args: any[]) {
    n.callMethod ? n.callMethod(...args) : n.queue.push(args);
  });
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  window.fbq('init', pixelId);
}

// Send server-side event via Conversions API
async function sendServerEvent(
  eventName: string,
  customData?: Record<string, any>,
  userData?: Record<string, any>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const eventId = `${eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Fire client-side event with deduplication ID
    if (window.fbq) {
      window.fbq('track', eventName, customData || {}, { eventID: eventId });
    }

    // Fire server-side event
    await supabase.functions.invoke('meta-conversions', {
      body: {
        events: [{
          event_name: eventName,
          event_id: eventId,
          event_source_url: window.location.href,
          user_data: {
            email: user?.email,
            client_user_agent: navigator.userAgent,
            fbc: getCookie('_fbc'),
            fbp: getCookie('_fbp'),
            ...userData,
          },
          custom_data: customData,
        }],
      },
    });
  } catch (error) {
    console.error('Meta pixel event error:', error);
  }
}

export const useMetaPixel = (pixelId?: string) => {
  useEffect(() => {
    if (!pixelId) return;
    initPixel(pixelId);
    window.fbq('track', 'PageView');

    // Send PageView server-side too
    sendServerEvent('PageView');
  }, [pixelId]);

  const trackPageView = useCallback(() => {
    sendServerEvent('PageView');
  }, []);

  const trackLead = useCallback((data?: { content_name?: string; value?: number; currency?: string }) => {
    sendServerEvent('Lead', data);
  }, []);

  const trackCompleteRegistration = useCallback((data?: { content_name?: string; value?: number; currency?: string; status?: string }) => {
    sendServerEvent('CompleteRegistration', data);
  }, []);

  const trackInitiateCheckout = useCallback((data?: { value?: number; currency?: string; content_ids?: string[]; content_type?: string }) => {
    sendServerEvent('InitiateCheckout', data);
  }, []);

  const trackPurchase = useCallback((data: { value: number; currency: string; content_ids?: string[]; content_name?: string; content_type?: string }) => {
    sendServerEvent('Purchase', data);
  }, []);

  const trackCustom = useCallback((eventName: string, data?: Record<string, any>) => {
    sendServerEvent(eventName, data);
  }, []);

  return {
    trackPageView,
    trackLead,
    trackCompleteRegistration,
    trackInitiateCheckout,
    trackPurchase,
    trackCustom,
  };
};
