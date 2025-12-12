
import React, { useState } from 'react';
import { ModuleView } from './components/ModuleView';
import { VisionAidView } from './components/VisionAidView';
import { GreenThumbView } from './components/GreenThumbView';
import { SettingsModal } from './components/SettingsModal';
import { APP_FEATURES } from './constants';
import * as Icons from 'lucide-react';

const App: React.FC = () => {
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const userName = localStorage.getItem('lifeos_username');
  const activeFeature = APP_FEATURES.find(f => f.id === activeFeatureId);

  return (
    <div className="min-h-screen flex font-sans text-slate-900 overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-900">
      
      <div className="flex-1 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] h-[calc(100dvh)] overflow-hidden relative">
        
        {/* Global Fluid Background - applied everywhere for continuity */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-slate-100/80">
            {/* The filter-liquid class applies the SVG distortion */}
            <div className="absolute inset-0 opacity-40 filter-liquid">
               <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-400/40 rounded-full mix-blend-multiply filter blur-[80px] animate-float"></div>
               <div className="absolute top-[20%] right-[-10%] w-[50%] h-[60%] bg-rose-400/40 rounded-full mix-blend-multiply filter blur-[80px] animate-float-delayed"></div>
               <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-emerald-400/40 rounded-full mix-blend-multiply filter blur-[80px] animate-float-fast"></div>
            </div>
            {/* Noise texture overlay for texture */}
            <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`}}></div>
        </div>

        {/* Content Container */}
        <div className="relative z-10 h-full">
        {activeFeature ? (
          activeFeature.id === '5' ? (
             <VisionAidView feature={activeFeature} onBack={() => setActiveFeatureId(null)} />
          ) : activeFeature.id === '13' ? (
             <GreenThumbView feature={activeFeature} onBack={() => setActiveFeatureId(null)} />
          ) : (
             <ModuleView feature={activeFeature} onBack={() => setActiveFeatureId(null)} />
          )
        ) : (
          /* 3D Dashboard View */
          <div className="h-full overflow-y-auto w-full px-4 py-8 md:px-12 md:py-12 pb-24 md:pb-12">
            
            {/* Top Bar */}
            <div className="flex justify-between items-start mb-10 md:mb-16 mt-4 relative z-10 animate-fade-up">
                <div>
                    <h1 className="text-4xl md:text-7xl font-black text-slate-800 mb-4 tracking-tighter drop-shadow-sm bg-clip-text text-transparent bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900">
                        {userName ? `Hello, ${userName}.` : 'LifeOS 3D'}
                    </h1>
                    <p className="text-lg md:text-2xl text-slate-600 font-medium max-w-2xl leading-relaxed backdrop-blur-sm">
                        Your fluid AI companion. Select a module to begin.
                    </p>
                </div>
                <button 
                   onClick={() => setIsSettingsOpen(true)}
                   className="p-3 bg-white/40 backdrop-blur-md rounded-full text-slate-600 hover:bg-white/60 hover:text-slate-900 transition-all shadow-sm"
                   title="Settings"
                >
                    <Icons.Settings size={24} />
                </button>
            </div>

            {/* 3D Feature Grid */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 max-w-7xl pb-20">
              {APP_FEATURES.map((feature, index) => {
                const IconComponent = (Icons as any)[feature.icon] || Icons.Circle;
                return (
                  <button 
                    key={feature.id}
                    onClick={() => setActiveFeatureId(feature.id)}
                    className="group relative h-full outline-none animate-fade-up perspective-1000"
                    style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                  >
                    {/* The Fluid Block */}
                    <div className="relative z-10 bg-white/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 
                                    transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] h-full flex flex-col items-start
                                    shadow-[0_8px_32px_rgba(0,0,0,0.05)] 
                                    group-hover:translate-y-[-8px] group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] group-hover:bg-white/60
                                    group-active:scale-[0.98] group-active:translate-y-0
                                    overflow-hidden">
                      
                      {/* Fluid Hover Gradient */}
                      <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-br ${feature.bgColor.replace('bg-', 'from-')} to-transparent`}></div>

                      {/* Icon Container with fluid shape */}
                      <div className={`w-16 h-16 rounded-2xl ${feature.bgColor} ${feature.color} flex items-center justify-center mb-6 
                                      shadow-lg shadow-black/5 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 ease-out relative z-10
                                      before:absolute before:inset-0 before:rounded-2xl before:border before:border-white/20 before:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]`}>
                        <IconComponent size={30} strokeWidth={2.5} />
                      </div>
                      
                      <h3 className="text-2xl font-bold text-slate-800 mb-3 relative z-10 tracking-tight">{feature.title}</h3>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed relative z-10">
                        {feature.shortDescription}
                      </p>
                      
                      {/* Glass Edge Highlight */}
                      <div className="absolute inset-0 rounded-[2rem] border border-white/40 pointer-events-none"></div>
                    </div>
                  </button>
                );
              })}
            </div>

             {/* API Key Note */}
             <div className="relative z-10 mt-12 md:mt-16 inline-flex items-center gap-3 px-5 py-3 bg-white/30 backdrop-blur-xl rounded-2xl border border-white/40 shadow-lg text-slate-600 text-xs font-bold uppercase tracking-wider animate-fade-up hover:bg-white/50 transition-colors" style={{ animationDelay: '500ms' }}>
               <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-600"><Icons.Cpu size={14} /></div>
               <span>Powered by Gemini 2.5 Flash</span>
            </div>
          </div>
        )}
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default App;
