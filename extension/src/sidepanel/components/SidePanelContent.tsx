/**
 * Side Panel Content Component
 * 
 * Content area for analysis results display.
 * Story 12.2: Side Panel Layout & Structure
 */

interface SidePanelContentProps {
  children: React.ReactNode;
  className?: string;
}

export function SidePanelContent({ children, className = '' }: SidePanelContentProps) {
  return (
    <div className={`p-4 space-y-4 min-h-full ${className}`}>
      {children}
    </div>
  );
}

