import { Newspaper, Users, FolderOpen, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ChannelTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isPrivateGroup?: boolean;
  isAdmin?: boolean;
  isPublicGroup?: boolean;
}

export function ChannelTabs({ 
  activeTab, 
  onTabChange, 
  isPrivateGroup = false,
  isAdmin = false,
  isPublicGroup = true
}: ChannelTabsProps) {
  const tabs: Tab[] = [
    { value: 'posts', label: 'Posts', icon: Newspaper },
  ];

  // Private groups get Updates tab between Posts and Leden
  if (isPrivateGroup) {
    tabs.push({ value: 'updates', label: 'Updates', icon: Bell });
  }

  // Show Leden tab (for private groups always, for public only for admins)
  if (isPrivateGroup || isAdmin) {
    tabs.push({ value: 'leden', label: 'Leden', icon: Users });
  }

  tabs.push({ value: 'materials', label: 'Materiaal', icon: FolderOpen });

  return (
    <div className="flex bg-muted/50 rounded-full p-1 gap-1 w-fit">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.value;
        
        return (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
