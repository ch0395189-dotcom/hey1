import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';

interface PullToRefreshContainerProps {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  className?: string;
  threshold?: number;
}

export const PullToRefreshContainer = ({
  children,
  onRefresh,
  className,
  threshold = 80,
}: PullToRefreshContainerProps) => {
  const { pullDistance, isRefreshing, isPulling, handlers } = usePullToRefresh({
    onRefresh,
    threshold,
  });

  const showIndicator = pullDistance > 10 || isRefreshing;
  const isReady = pullDistance >= threshold;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Pull indicator */}
      <motion.div
        className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
        style={{ top: -40 }}
        animate={{
          y: showIndicator ? pullDistance + 40 : 0,
          opacity: showIndicator ? 1 : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors",
            isReady || isRefreshing
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground border border-border"
          )}
        >
          <motion.div
            animate={{
              rotate: isRefreshing ? 360 : isReady ? 180 : pullDistance * 2,
            }}
            transition={{
              rotate: isRefreshing
                ? { repeat: Infinity, duration: 1, ease: 'linear' }
                : { type: 'spring', stiffness: 200 },
            }}
          >
            <RefreshCw className="w-5 h-5" />
          </motion.div>
        </div>
      </motion.div>

      {/* Content with pull transform */}
      <motion.div
        className="h-full overflow-y-auto"
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : 'translateY(0)',
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
        onTouchStart={handlers.onTouchStart}
        onTouchMove={handlers.onTouchMove}
        onTouchEnd={handlers.onTouchEnd}
      >
        {children}
      </motion.div>
    </div>
  );
};
