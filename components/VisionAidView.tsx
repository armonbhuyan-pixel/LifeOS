
import React, { useRef, useState, useEffect } from 'react';
import { AppFeature } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import * as Icons from 'lucide-react';

interface VisionAidViewProps {
  feature: AppFeature;
  onBack: () => void;
}

// --- Audio Encoding/Decoding Helpers ---
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  // Custom encode function for PCM
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  } as any; // Casting to any because the SDK Blob type expects 'data' to be string
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const VisionAidView: React.FC<VisionAidViewProps> = ({ feature, onBack }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [modelSpeaking, setModelSpeaking] = useState(false);

  // Refs for media elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Refs for audio processing
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  // Refs for session management
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Constants
  const FRAME_RATE = 2; // Frames per second sent to model
  const JPEG_QUALITY = 0.5;

  const startSession = async () => {
    setError(null);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
          setError("API Key is missing.");
          return;
      }
      
      const client = new GoogleGenAI({ apiKey });

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);
      outputNodeRef.current = outputNode;

      // 2. Get User Media (Audio + Video)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
      streamRef.current = stream;

      // 3. Setup Video Preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Proxy Promise to handle circular dependency between connect and callbacks
      let resolveSession: (s: any) => void = () => {};
      const proxySessionPromise = new Promise<any>((resolve) => {
          resolveSession = resolve;
      });

      // 4. Connect to Gemini Live
      const sessionPromise = client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are Vision Aid, a real-time visual assistant for the visually impaired.
          - Continuously describe the video feed.
          - Focus on obstacles, text, people, and safety hazards.
          - Be concise but descriptive. 
          - If the user speaks, answer their question about the scene immediately.
          - Speak clearly and calmly.`,
        },
        callbacks: {
          onopen: () => {
            console.log("Vision Aid Session Opened");
            setIsConnected(true);
            
            // Start Audio Input Streaming
            if (!inputAudioContextRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Calculate volume for UI
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setUserSpeaking(Math.sqrt(sum / inputData.length) > 0.05);

              const pcmBlob = createBlob(inputData);
              // Use proxySessionPromise here
              proxySessionPromise.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);

            // Start Video Frame Streaming using proxy
            startVideoStreaming(proxySessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio) {
              setModelSpeaking(true);
              if (!outputAudioContextRef.current || !outputNodeRef.current) return;
              
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                ctx
              );
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current);
              
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
                if (audioSourcesRef.current.size === 0) setModelSpeaking(false);
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            // Handle Turn Complete
            if (message.serverContent?.turnComplete) {
               // Logic if needed
            }
          },
          onclose: () => {
            console.log("Session Closed");
            setIsConnected(false);
          },
          onerror: (e) => {
            console.error("Session Error", e);
            setError("Connection error. Please try again.");
            stopSession();
          }
        }
      });
      
      // Resolve the proxy with the actual session
      sessionPromise.then(sess => {
          resolveSession(sess);
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start session", err);
      setError("Failed to access camera or microphone.");
    }
  };

  const startVideoStreaming = (sessionPromise: Promise<any>) => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    frameIntervalRef.current = window.setInterval(() => {
        if (!canvasRef.current || !videoRef.current) return;
        
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;
        
        // Draw video frame to canvas
        canvas.width = video.videoWidth * 0.5; // Downscale for performance
        canvas.height = video.videoHeight * 0.5;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
            if (blob) {
                const base64Data = await blobToBase64(blob);
                sessionPromise.then((session: any) => {
                    session.sendRealtimeInput({
                        media: { data: base64Data, mimeType: 'image/jpeg' }
                    });
                });
            }
        }, 'image/jpeg', JPEG_QUALITY);

    }, 1000 / FRAME_RATE);
  };

  const stopSession = () => {
    // 1. Clear Interval
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }

    // 2. Stop Media Stream
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    // 3. Close Audio Contexts
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    // 4. Close Session
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then((session: any) => session.close());
        sessionPromiseRef.current = null;
    }

    setIsConnected(false);
    setUserSpeaking(false);
    setModelSpeaking(false);
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <div className="relative h-full w-full bg-black overflow-hidden flex flex-col items-center justify-center">
        {/* Full Screen Video Feed */}
        <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover opacity-80"
            playsInline 
            muted 
        />
        
        {/* Hidden Canvas for Processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onBack}
                        className="pointer-events-auto p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20 text-white hover:bg-white/20 transition-all"
                        title="Back to Dashboard"
                    >
                        <Icons.ArrowLeft size={20} />
                    </button>
                    <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-white text-xs font-bold uppercase tracking-wider">
                            {isConnected ? 'Live Vision Active' : 'Offline'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Central Controls (if not connected) */}
            {!isConnected && !error && (
                <div className="pointer-events-auto flex flex-col items-center gap-6 animate-in zoom-in duration-300">
                    <div className="w-24 h-24 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                        <Icons.Eye size={48} className="text-emerald-400" />
                    </div>
                    <h2 className="text-white text-2xl font-black tracking-tight">Vision Aid</h2>
                    <p className="text-slate-400 text-center max-w-xs text-sm">
                        Point your camera at your surroundings for real-time AI description and assistance.
                    </p>
                    <button 
                        onClick={startSession}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-2"
                    >
                        <Icons.Power size={20} /> Start Live Session
                    </button>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="pointer-events-auto bg-red-500/90 backdrop-blur text-white px-6 py-4 rounded-2xl max-w-sm text-center shadow-xl animate-in fade-in slide-in-from-bottom-10">
                    <Icons.AlertTriangle size={32} className="mx-auto mb-2" />
                    <p className="font-bold mb-4">{error}</p>
                    <button onClick={startSession} className="bg-white text-red-600 px-4 py-2 rounded-lg text-sm font-bold">Retry</button>
                </div>
            )}

            {/* Live Indicators */}
            {isConnected && (
                <div className="flex flex-col gap-4 items-center animate-in fade-in slide-in-from-bottom-10">
                    {/* Audio Visualizer (Simple) */}
                    <div className="flex gap-2 items-end h-12 mb-4">
                         {/* User Voice Indicator */}
                         <div className={`transition-all duration-200 w-2 bg-blue-500 rounded-full ${userSpeaking ? 'h-12' : 'h-3 opacity-50'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-blue-500 rounded-full ${userSpeaking ? 'h-8' : 'h-3 opacity-50'}`}></div>
                         
                         {/* Spacer */}
                         <div className="w-4"></div>

                         {/* AI Voice Indicator */}
                         <div className={`transition-all duration-200 w-2 bg-emerald-500 rounded-full ${modelSpeaking ? 'h-12' : 'h-3 opacity-50'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-emerald-500 rounded-full ${modelSpeaking ? 'h-8' : 'h-3 opacity-50'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-emerald-500 rounded-full ${modelSpeaking ? 'h-10' : 'h-3 opacity-50'}`}></div>
                    </div>

                    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-full max-w-md text-center">
                         <p className="text-slate-300 text-sm font-medium animate-pulse">
                             {modelSpeaking ? "Speaking..." : "Listening & Watching..."}
                         </p>
                    </div>

                    <button 
                        onClick={stopSession}
                        className="pointer-events-auto bg-red-600/80 hover:bg-red-600 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
                    >
                        <Icons.X size={24} />
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};
