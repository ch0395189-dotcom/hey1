import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface UseSessionPersistenceOptions {
  onSessionRestored?: (user: any) => void;
  onSessionLost?: () => void;
  redirectOnLost?: string;
}

export const useSessionPersistence = (options: UseSessionPersistenceOptions = {}) => {
  const navigate = useNavigate();
  const { onSessionRestored, onSessionLost, redirectOnLost = '/login' } = options;

  // Refresh session when app becomes visible (mobile background/foreground)
  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Session] App became visible, checking session...');
      
      try {
        // First try to get existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[Session] Error getting session:', error);
        }

        if (session?.user) {
          console.log('[Session] Session found, refreshing token...');
          // Proactively refresh the token to ensure it's valid
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError) {
            console.warn('[Session] Token refresh failed:', refreshError);
            // Don't navigate away immediately, the session might still be valid
          } else if (refreshData.session) {
            console.log('[Session] Token refreshed successfully');
            onSessionRestored?.(refreshData.session.user);
          }
        } else {
          console.log('[Session] No session found');
        }
      } catch (err) {
        console.error('[Session] Unexpected error:', err);
      }
    }
  }, [onSessionRestored]);

  // Handle page focus (alternative to visibility for some browsers)
  const handleFocus = useCallback(async () => {
    console.log('[Session] Window focused, verifying session...');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      onSessionRestored?.(session.user);
    }
  }, [onSessionRestored]);

  useEffect(() => {
    // Set up auth state listener FIRST (before checking session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Session] Auth state changed:', event);
        
        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'INITIAL_SESSION':
            if (session?.user) {
              console.log('[Session] User authenticated:', session.user.email);
              onSessionRestored?.(session.user);
            }
            break;
            
          case 'SIGNED_OUT':
            console.log('[Session] User signed out');
            onSessionLost?.();
            navigate(redirectOnLost);
            break;
        }
      }
    );

    // Then check for existing session
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('[Session] No initial session found');
        onSessionLost?.();
        navigate(redirectOnLost);
      } else {
        console.log('[Session] Initial session found');
        onSessionRestored?.(session.user);
      }
    };

    initSession();

    // Add visibility change listener for mobile app background/foreground
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Also refresh on page load/reload
    handleVisibilityChange();

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [navigate, redirectOnLost, onSessionRestored, onSessionLost, handleVisibilityChange, handleFocus]);

  // Manual session refresh function
  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error('[Session] Manual refresh failed:', error);
      return null;
    }
    return data.session;
  }, []);

  return { refreshSession };
};
