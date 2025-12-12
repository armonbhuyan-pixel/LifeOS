
import React, { useState, useEffect, useRef } from 'react';
import { generateSpeech } from '../services/geminiService';
import * as Icons from 'lucide-react';

interface PresentationModeProps {
  isActive: boolean;
  onClose: () => void;
  onNavigate: (featureId: string | null) => void;
}

const DEMO_SCRIPT = [
  {
    id: 'intro',
    featureId: null, // Dashboard
    text: "Welcome to Life OS. The next generation of AI companionship, designed to enhance every aspect of your daily life through advanced, multimodal intelligence.",
    wait: 1000
  },
  {
    id: 'medical-lens',
    featureId: 'medical-lens',
    text: "Medical Lens simplifies your healthcare. Upload complex lab reports, handwritten prescriptions, or medication bottles. Life OS instantly transforms them into clear, actionable summaries you can trust.",
    wait: 2000
  },
  {
    id: 'green-thumb',
    featureId: '13',
    text: "For your garden, Green Thumb acts as an expert botanist. By analyzing live video of your plants, it diagnoses health issues and provides specific care instructions instantly.",
    wait: 2000
  },
  {
    id: 'vision-aid',
    featureId: '5',
    text: "We believe in accessibility for everyone. Vision Aid describes the world in real-time, helping visually impaired users navigate their surroundings with confidence and independence.",
    wait: 2000
  },
  {
    id: 'outro',
    featureId: null, // Back to Dashboard
    text: "Life OS. Intelligent. Intuitive. And built for you. Start your journey today.",
    wait: 0
  }
];

// Helper to decode Base64
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({ isActive, onClose, onNavigate }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (isActive) {
        startPresentation();
    } else {
        stopPresentation();
    }
    return () => stopPresentation();
  }, [isActive]);

  const stopPresentation = () => {
      isCancelledRef.current = true;
      if (activeSourceRef.current) {
          try { activeSourceRef.current.stop(); } catch(e) {}
      }
      if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
      }
      setIsPlaying(false);
      setCurrentSubtitle("");
      onClose();
  };

  const playAudio = async (base64PCM: string): Promise<void> => {
      return new Promise((resolve) => {
          if (isCancelledRef.current) return resolve();

          try {
              if (!audioContextRef.current) {
                  audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              }
              const ctx = audioContextRef.current;
              const pcmData = decodeBase64(base64PCM);
              const float32Data = new Float32Array(pcmData.length / 2);
              const dataInt16 = new Int16Array(pcmData.buffer);

              for (let i = 0; i < dataInt16.length; i++) {
                  float32Data[i] = dataInt16[i] / 32768.0;
              }

              const buffer = ctx.createBuffer(1, float32Data.length, 24000);
              buffer.copyToChannel(float32Data, 0);

              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              source.onended = () => resolve();
              
              activeSourceRef.current = source;
              source.start();
          } catch (e) {
              console.error("Audio playback error", e);
              resolve(); // Skip on error
          }
      });
  };

  const processStep = async (index: number) => {
      if (index >= DEMO_SCRIPT.length || isCancelledRef.current) {
          stopPresentation();
          return;
      }

      setCurrentStepIndex(index);
      const step = DEMO_SCRIPT[index];
      
      // 1. Navigate UI
      onNavigate(step.featureId);
      setCurrentSubtitle(step.text);
      setIsBuffering(true);

      try {
          // 2. Generate Audio
          const pcmBase64 = await generateSpeech(step.text);
          setIsBuffering(false);
          
          if (pcmBase64 && !isCancelledRef.current) {
              // 3. Play Audio
              await playAudio(pcmBase64);
              
              // 4. Wait designated time before next slide
              if (!isCancelledRef.current) {
                  setTimeout(() => {
                      processStep(index + 1);
                  }, step.wait);
              }
          } else {
               // Fallback if no audio
               setTimeout(() => {
                  processStep(index + 1);
               }, 3000);
          }
      } catch (e) {
          console.error("Presentation error", e);
          processStep(index + 1);
      }
  };

  const startPresentation = () => {
      isCancelledRef.current = false;
      setIsPlaying(true);
      setCurrentStepIndex(0);
      processStep(0);
  };

  if (!isActive) return null;

  const progress = ((currentStepIndex + 1) / DEMO_SCRIPT.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col justify-end">
        {/* Cinematic Letterbox Bars */}
        <div className="fixed top-0 left-0 right-0 h-16 bg-black z-50 animate-in slide-in-from-top duration-700"></div>
        <div className="fixed bottom-0 left-0 right-0 h-24 bg-black z-50 animate-in slide-in-from-bottom duration-700 flex items-center justify-center px-8">
            
            <div className="w-full max-w-4xl flex items-center gap-6 pointer-events-auto">
                <button 
                  onClick={stopPresentation}
                  className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
                  title="Stop Presentation"
                >
                    <Icons.Square size={18} fill="currentColor" />
                </button>

                <div className="flex-1">
                    <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
                        <span>LifeOS Feature Tour</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <div className="mt-3 text-center">
                        <p className="text-white/90 text-lg font-medium leading-tight drop-shadow-md animate-in fade-in slide-in-from-bottom-2 duration-500 key={currentSubtitle}">
                           {isBuffering ? <span className="animate-pulse text-slate-500">Generating voiceover...</span> : currentSubtitle}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Live Demo</span>
                </div>
            </div>

        </div>

        {/* Overlay Vignette */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] z-40"></div>
    </div>
  );
};
