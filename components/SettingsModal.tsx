import React, { useState } from 'react';
import * as Icons from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [userName, setUserName] = useState(localStorage.getItem('lifeos_username') || '');

  const handleSave = () => {
    localStorage.setItem('lifeos_username', userName.trim());
    // Reload to propagate changes simply across all components
    window.location.reload(); 
  };

  const handleClearData = () => {
    if(confirm('Are you sure you want to clear all app data? This will reset your name and preferences.')) {
        localStorage.clear();
        window.location.reload();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 m-4">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
             <Icons.Settings size={20} className="text-slate-500"/> Settings
           </h2>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
             <Icons.X size={20} />
           </button>
        </div>
        
        <div className="p-6 space-y-6">
           {/* Profile */}
           <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">User Profile</h3>
              <div className="space-y-1">
                 <label className="text-sm font-medium text-slate-700">Display Name</label>
                 <input 
                   type="text" 
                   value={userName}
                   onChange={(e) => setUserName(e.target.value)}
                   placeholder="What should we call you?"
                   className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50"
                 />
                 <p className="text-[10px] text-slate-400">We'll use this to personalize your AI coach greetings.</p>
              </div>
           </div>

           <hr className="border-slate-100" />

           {/* Data */}
           <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Management</h3>
              <button 
                onClick={handleClearData}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors flex items-center gap-2"
              >
                <Icons.Trash2 size={16} /> Reset All Preferences
              </button>
              <p className="text-[10px] text-slate-400 px-1">Clears local storage including your name and cached settings.</p>
           </div>
           
           <div className="text-center pt-2">
              <p className="text-[10px] text-slate-300 font-mono">LifeOS v1.0.0 • Powered by Gemini</p>
           </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
           >
             Cancel
           </button>
           <button 
             onClick={handleSave}
             className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors hover:scale-105 transform duration-200"
           >
             Save Changes
           </button>
        </div>
      </div>
    </div>
  );
};