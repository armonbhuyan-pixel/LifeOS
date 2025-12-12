
import React from 'react';
import { LayoutGrid, Settings } from 'lucide-react';
import { APP_FEATURES } from '../constants';
import * as Icons from 'lucide-react';

interface SidebarProps {
  activeFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeFeatureId, onSelectFeature, onOpenSettings }) => {
  return (
    <div className="fixed z-50 
                    /* Mobile: Bottom Dock */
                    bottom-4 left-4 right-4 h-24 rounded-[2rem] flex flex-row items-center justify-between px-6 
                    border border-white/20 bg-slate-900/60 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)]
                    /* Desktop: Left Pillar */
                    md:top-6 md:left-6 md:bottom-6 md:right-auto md:w-24 md:flex-col md:py-8 md:justify-start md:overflow-y-auto md:no-scrollbar md:h-[calc(100vh-3rem)]
                    transition-all duration-500 ease-out
    ">
      {/* Dashboard Home Button */}
      <button 
        onClick={() => onSelectFeature(null)}
        className={`p-4 rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] md:mb-8 relative group
            ${activeFeatureId === null 
              ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] translate-y-0 scale-110 ring-2 ring-indigo-400/50' 
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]'
            }`}
        title="Dashboard"
      >
        <LayoutGrid size={26} strokeWidth={2.5} />
      </button>
      
      {/* Divider */}
      <div className="hidden md:block w-12 h-[2px] bg-white/10 rounded-full mb-8"></div>

      {/* Features List */}
      <div className="flex flex-row gap-3 overflow-x-auto w-full px-2 md:px-0 md:flex-col md:w-full md:items-center md:gap-5 md:overflow-visible no-scrollbar py-2 md:py-0">
        {APP_FEATURES.map((feature, index) => {
           const IconComponent = (Icons as any)[feature.icon] || Icons.Circle;
           const isActive = activeFeatureId === feature.id;

           return (
            <button 
              key={feature.id}
              onClick={() => onSelectFeature(feature.id)}
              className={`p-3.5 rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shrink-0 relative group
                ${isActive 
                  ? `bg-white ${feature.color} shadow-[0_0_25px_rgba(255,255,255,0.3)] translate-y-0 scale-110 z-10 ring-2 ring-white/50` 
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                }`}
            >
              <IconComponent size={24} strokeWidth={isActive ? 3 : 2} />
              
              {/* Fluid Tooltip */}
              <span className="hidden md:block absolute left-20 top-1/2 -translate-y-1/2 bg-slate-800/90 backdrop-blur-md text-white text-xs font-bold px-4 py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out whitespace-nowrap pointer-events-none z-50 border border-white/10 shadow-xl translate-x-[-10px] group-hover:translate-x-2">
                {feature.title}
                {/* Arrow */}
                <span className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-slate-800/90"></span>
              </span>
            </button>
           );
        })}
      </div>

      {/* Settings */}
      <div className="md:mt-auto pt-2 md:pt-8 md:border-t-0">
         <button 
           onClick={onOpenSettings}
           className="p-3.5 bg-white/5 rounded-2xl transition-all duration-300 ease-out text-slate-400 hover:bg-white/10 hover:text-white hover:scale-105"
           title="Settings"
         >
          <Settings size={24} />
        </button>
      </div>
    </div>
  );
};
