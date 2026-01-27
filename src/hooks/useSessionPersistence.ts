import { useEffect, useCallback, useRef } from 'react';
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
  const refreshInProgressRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const minRefreshInterval = 30000; // 30 seconds minimum between refreshes

  // Refresh session with debounce protection
  const safeRefreshSession = useCallback(async () => {
    const now = Date.now();
    
    // Prevent concurrent refreshes and rate limit
    if (refreshInProgressRef.current || (now - lastRefreshRef.current) < minRefreshInterval) {
      console.log('[Session] Refresh skipped - already in progress or rate limited');
      return null;
    }

    refreshInProgressRef.current = true;
    lastRefreshRef.current = now;

    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.warn('[Session] Refresh error:', error.message);
        // Don't immediately sign out - token might still be valid
        return null;
      }
      
      if (data.session) {
        console.log('[Session] Token refreshed successfully');
        return data.session;
      }
      
      return null;
    } catch (err) {
      console.error('[Session] Unexpected refresh error:', err);
      return null;
    } finally {
      refreshInProgressRef.current = false;
    }
  }, []);

  // Refresh session when app becomes visible (mobile background/foreground)
  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Session] App became visible, checking session...');
      
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('[Session] Session found, user:', session.user.email);
          
          // Only refresh if token expires soon (within 10 minutes)
          const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
          const timeUntilExpiry = expiresAt - Date.now();
          
          if (timeUntilExpiry < 10 * 60 * 1000) {
            console.log('[Session] Token expiring soon, refreshing...');
            const refreshed = await safeRefreshSession();
            if (refreshed) {
              onSessionRestored?.(refreshed.user);
            } else {
              // Keep existing session if refresh failed
              onSessionRestored?.(session.user);
            }
          } else {
            onSessionRestored?.(session.user);
          }
        } else {
          console.log('[Session] No session found on visibility change');
        }
      } catch (err) {
        console.error('[Session] Visibility check error:', err);
      }
    }
  }, [onSessionRestored, safeRefreshSession]);

  // Handle page focus (alternative to visibility for some browsers)
  const handleFocus = useCallback(async () => {
    console.log('[Session] Window focused');
    // Use visibility change handler which has better logic
    if (document.visibilityState === 'visible') {
      handleVisibilityChange();
    }
  }, [handleVisibilityChange]);

  // Handle online event - refresh session when coming back online
  const handleOnline = useCallback(async () => {
    console.log('[Session] Network came online, verifying session...');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      await safeRefreshSession();
      onSessionRestored?.(session.user);
    }
  }, [onSessionRestored, safeRefreshSession]);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
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
      
      if (!mounted) return;
      
      if (!session) {
        console.log('[Session] No initial session found');
        onSessionLost?.();
        navigate(redirectOnLost);
      } else {
        console.log('[Session] Initial session found for:', session.user.email);
        onSessionRestored?.(session.user);
      }
    };

    initSession();

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // Set up periodic session check every 5 minutes (only when visible)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        safeRefreshSession();
      }
    }, 5 * 60 * 1000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      clearInterval(intervalId);
    };
  }, [navigate, redirectOnLost, onSessionRestored, onSessionLost, handleVisibilityChange, handleFocus, handleOnline, safeRefreshSession]);

  return { refreshSession: safeRefreshSession };
};
