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
  const sessionValidRef = useRef(true);
  const minRefreshInterval = 30000; // 30 seconds minimum between refreshes

  // Store callbacks in refs to prevent unnecessary re-subscriptions
  const onSessionRestoredRef = useRef(onSessionRestored);
  const onSessionLostRef = useRef(onSessionLost);
  
  useEffect(() => {
    onSessionRestoredRef.current = onSessionRestored;
    onSessionLostRef.current = onSessionLost;
  }, [onSessionRestored, onSessionLost]);

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
        // Check if it's a network error vs auth error
        if (error.message.includes('network') || error.message.includes('fetch')) {
          console.log('[Session] Network error during refresh, keeping session');
          return null;
        }
        return null;
      }
      
      if (data.session) {
        console.log('[Session] Token refreshed successfully');
        sessionValidRef.current = true;
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

  // Check session validity without refreshing
  const checkSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (err) {
      console.error('[Session] Check error:', err);
      return null;
    }
  }, []);

  // Refresh session when app becomes visible (mobile background/foreground)
  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Session] App became visible, checking session...');
      
      try {
        const session = await checkSession();

        if (session?.user) {
          console.log('[Session] Session found, user:', session.user.email);
          sessionValidRef.current = true;
          
          // Only refresh if token expires soon (within 10 minutes)
          const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
          const timeUntilExpiry = expiresAt - Date.now();
          
          if (timeUntilExpiry < 10 * 60 * 1000) {
            console.log('[Session] Token expiring soon, refreshing...');
            const refreshed = await safeRefreshSession();
            if (refreshed) {
              onSessionRestoredRef.current?.(refreshed.user);
            } else {
              // Keep existing session if refresh failed
              onSessionRestoredRef.current?.(session.user);
            }
          } else {
            onSessionRestoredRef.current?.(session.user);
          }
        } else {
          console.log('[Session] No session found on visibility change');
          // Don't redirect immediately - could be network issue
          // Let the auth state change listener handle this
        }
      } catch (err) {
        console.error('[Session] Visibility check error:', err);
        // Don't redirect on error - could be network issue
      }
    }
  }, [checkSession, safeRefreshSession]);

  // Handle online event - refresh session when coming back online
  const handleOnline = useCallback(async () => {
    console.log('[Session] Network came online, verifying session...');
    
    // Wait a moment for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const session = await checkSession();
    
    if (session?.user) {
      sessionValidRef.current = true;
      await safeRefreshSession();
      onSessionRestoredRef.current?.(session.user);
    }
  }, [checkSession, safeRefreshSession]);

  // Handle before unload - persist session state
  const handleBeforeUnload = useCallback(() => {
    // Mark that we're leaving intentionally
    try {
      sessionStorage.setItem('heyhey-intentional-leave', 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Handle page show (for bfcache restoration on mobile)
  const handlePageShow = useCallback(async (event: PageTransitionEvent) => {
    if (event.persisted) {
      console.log('[Session] Page restored from bfcache');
      const session = await checkSession();
      if (session?.user) {
        sessionValidRef.current = true;
        onSessionRestoredRef.current?.(session.user);
      }
    }
  }, [checkSession]);

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
              sessionValidRef.current = true;
              onSessionRestoredRef.current?.(session.user);
            }
            break;
            
          case 'SIGNED_OUT':
            // Only redirect if session was valid before (prevents double redirect)
            if (sessionValidRef.current) {
              console.log('[Session] User signed out');
              sessionValidRef.current = false;
              onSessionLostRef.current?.();
              navigate(redirectOnLost);
            }
            break;
        }
      }
    );

    // Then check for existing session
    const initSession = async () => {
      const session = await checkSession();
      
      if (!mounted) return;
      
      if (!session) {
        console.log('[Session] No initial session found');
        sessionValidRef.current = false;
        onSessionLostRef.current?.();
        navigate(redirectOnLost);
      } else {
        console.log('[Session] Initial session found for:', session.user.email);
        sessionValidRef.current = true;
        onSessionRestoredRef.current?.(session.user);
      }
    };

    initSession();

    // Add event listeners for mobile app lifecycle
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pageshow', handlePageShow);

    // Set up periodic session check every 5 minutes (only when visible)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && sessionValidRef.current) {
        safeRefreshSession();
      }
    }, 5 * 60 * 1000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pageshow', handlePageShow);
      clearInterval(intervalId);
    };
  }, [navigate, redirectOnLost, handleVisibilityChange, handleOnline, handleBeforeUnload, handlePageShow, checkSession, safeRefreshSession]);

  return { refreshSession: safeRefreshSession, checkSession };
};
