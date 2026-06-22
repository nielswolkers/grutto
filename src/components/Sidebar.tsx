import { Home, Calendar, Clock, BarChart3, CheckSquare, FileText, Bell, User, BookOpen, Compass, GraduationCap } from 'lucide-react';
import { NavLink } from './NavLink';
import gruttoLogo from '@/assets/grutto-logo.png';
import gruttoIcon from '@/assets/grutto-icon.png';
import { useState, useRef, useEffect } from 'react';
import { useSidebarState } from '@/contexts/SidebarContext';
import { NotificationBadge } from './NotificationBadge';
const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 72;

export function Sidebar() {
  const { isCollapsed, setIsCollapsed } = useSidebarState();
  const [isDragging, setIsDragging] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
  const sidebarRef = useRef<HTMLElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(EXPANDED_WIDTH);

  // Sync currentWidth with isCollapsed state
  useEffect(() => {
    if (!isDragging) {
      setCurrentWidth(isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
    }
  }, [isCollapsed, isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Check if click is on a nav link - if so, don't start dragging
    const target = e.target as HTMLElement;
    if (target.closest('a')) {
      return;
    }
    
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = currentWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - dragStartXRef.current;
      const newWidth = Math.max(COLLAPSED_WIDTH, Math.min(EXPANDED_WIDTH, dragStartWidthRef.current + delta));
      setCurrentWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      // Snap to collapsed or expanded based on drag direction and threshold
      const dragDelta = dragStartWidthRef.current - currentWidth;
      const threshold = 30; // pixels of drag needed to trigger snap
      
      if (dragDelta > threshold) {
        // Dragging to collapse
        setCurrentWidth(COLLAPSED_WIDTH);
        setIsCollapsed(true);
      } else if (dragDelta < -threshold) {
        // Dragging to expand
        setCurrentWidth(EXPANDED_WIDTH);
        setIsCollapsed(false);
      } else {
        // Not enough movement, return to original state
        setCurrentWidth(dragStartWidthRef.current);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, currentWidth, setIsCollapsed]);

  const handleClick = (e: React.MouseEvent) => {
    // Only toggle if not clicking on a nav link and not dragging
    const target = e.target as HTMLElement;
    if (target.closest('a') || isDragging) {
      return;
    }
    
    // Toggle collapsed state
    setIsCollapsed(!isCollapsed);
    setCurrentWidth(isCollapsed ? EXPANDED_WIDTH : COLLAPSED_WIDTH);
  };

  // Calculate opacity for text elements (1 when expanded, 0 when collapsed)
  const textOpacity = Math.max(0, (currentWidth - COLLAPSED_WIDTH) / (EXPANDED_WIDTH - COLLAPSED_WIDTH));
  // Inverse opacity for collapsed icon
  const iconOpacity = 1 - textOpacity;

  return (
    <aside 
      ref={sidebarRef}
      className="hidden md:flex bg-sidebar border-r border-sidebar-border flex-col h-screen sticky top-0 overflow-hidden cursor-ew-resize select-none"
      style={{ 
        width: currentWidth,
        transition: isDragging ? 'none' : 'width 0.3s ease-out'
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Logo */}
      <div className="p-6 pl-[22px] relative h-[68px]">
        {/* Full logo - fades out when collapsed */}
        <img 
          src={gruttoLogo} 
          alt="Grutto" 
          className="h-8 w-auto absolute"
          style={{ 
            opacity: textOpacity,
            transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
          }}
        />
        {/* Icon logo - fades in when collapsed */}
        <img 
          src={gruttoIcon} 
          alt="Grutto" 
          className="h-8 w-auto absolute"
          style={{ 
            opacity: iconOpacity,
            transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
          }}
        />
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3">
        {/* Menu label removed - space preserved */}
        <div className="h-6 mb-2"></div>
        <div className="space-y-1">
          <NavLink 
            to="/dashboard" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Home</span>
          </NavLink>
          
          <NavLink 
            to="/agenda" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <Calendar className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Agenda</span>
          </NavLink>
          
          <NavLink 
            to="/studie" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <Clock className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Studie</span>
          </NavLink>
          
          <NavLink 
            to="/cijfers" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <BarChart3 className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Cijfers</span>
          </NavLink>
          
          <NavLink 
            to="/taken" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <CheckSquare className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Taken</span>
          </NavLink>
          
          <NavLink 
            to="/materialen" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <FileText className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Materialen</span>
          </NavLink>
          
          <NavLink 
            to="/notities" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <BookOpen className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ 
                opacity: textOpacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
              }}
            >Notities</span>
          </NavLink>
          
          <NavLink 
            to="/communities" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <Compass className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ opacity: textOpacity, transition: isDragging ? 'none' : 'opacity 0.3s ease-out' }}
            >Communities</span>
          </NavLink>

          <NavLink 
            to="/grutto-ai" 
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <GraduationCap className="w-5 h-5 flex-shrink-0" />
            <span 
              className="whitespace-nowrap overflow-hidden"
              style={{ opacity: textOpacity, transition: isDragging ? 'none' : 'opacity 0.3s ease-out' }}
            >Grutto AI</span>
          </NavLink>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <NavLink 
          to="/meldingen" 
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors relative"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        >
          <div className="relative flex-shrink-0">
            <Bell className="w-5 h-5" />
            {/* Collapsed state dot */}
            <div style={{ 
              opacity: iconOpacity,
              transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
            }}>
              <NotificationBadge collapsed />
            </div>
          </div>
          <span 
            className="whitespace-nowrap overflow-hidden"
            style={{ 
              opacity: textOpacity,
              transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
            }}
          >Meldingen</span>
          <div style={{ 
            opacity: textOpacity,
            transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
          }}>
            <NotificationBadge />
          </div>
        </NavLink>
        
        <NavLink 
          to="/account" 
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        >
          <User className="w-5 h-5 flex-shrink-0" />
          <span 
            className="whitespace-nowrap overflow-hidden"
            style={{ 
              opacity: textOpacity,
              transition: isDragging ? 'none' : 'opacity 0.3s ease-out'
            }}
          >Account</span>
        </NavLink>
      </div>
    </aside>
  );
}