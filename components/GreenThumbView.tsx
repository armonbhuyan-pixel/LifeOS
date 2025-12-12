
import React, { useRef, useState, useEffect } from 'react';
import { AppFeature } from '../types';
import { ModuleView } from './ModuleView';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import * as Icons from 'lucide-react';

interface GreenThumbViewProps {
  feature: AppFeature;
  onBack: () => void;
}

// --- Audio Encoding/Decoding Helpers (Reused from VisionAid) ---
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
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
  } as any;
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

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): Promise<AudioBuffer> {
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

export const GreenThumbView: React.FC<GreenThumbViewProps> = ({ feature, onBack }) => {
  const [isLive, setIsLive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [modelSpeaking, setModelSpeaking] = useState(false);

  // Live Session Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const FRAME_RATE = 2;
  const JPEG_QUALITY = 0.5;

  const startSession = async () => {
    setError(null);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
          setError("API Key is missing. Please check your settings.");
          return;
      }
      
      const client = new GoogleGenAI({ apiKey });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);
      outputNodeRef.current = outputNode;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      let resolveSession: (s: any) => void = () => {};
      const proxySessionPromise = new Promise<any>((resolve) => { resolveSession = resolve; });

      const sessionPromise = client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: `You are Green Thumb, a friendly and expert AI Botanist.
          - Analyze the video feed to identify plants, flowers, and trees in real-time.
          - Diagnose visible plant health issues (yellowing leaves, pests, drooping).
          - Provide specific care tips regarding light, water, and soil.
          - Be concise, encouraging, and "earthy" in your tone.`,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            if (!inputAudioContextRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setUserSpeaking(Math.sqrt(sum / inputData.length) > 0.05);

              const pcmBlob = createBlob(inputData);
              proxySessionPromise.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
            startVideoStreaming(proxySessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setModelSpeaking(true);
              if (!outputAudioContextRef.current || !outputNodeRef.current) return;
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx);
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
          },
          onclose: () => setIsConnected(false),
          onerror: (e) => {
            console.error("Session Error", e);
            setError("Connection error. Please try again.");
            stopSession();
          }
        }
      });
      sessionPromise.then(sess => resolveSession(sess));
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
        canvas.width = video.videoWidth * 0.5; 
        canvas.height = video.videoHeight * 0.5;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
            if (blob) {
                const base64Data = await blobToBase64(blob);
                sessionPromise.then((session: any) => {
                    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                });
            }
        }, 'image/jpeg', JPEG_QUALITY);
    }, 1000 / FRAME_RATE);
  };

  const stopSession = () => {
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (inputAudioContextRef.current) { inputAudioContextRef.current.close(); inputAudioContextRef.current = null; }
    if (outputAudioContextRef.current) { outputAudioContextRef.current.close(); outputAudioContextRef.current = null; }
    if (sessionPromiseRef.current) { sessionPromiseRef.current.then((session: any) => session.close()); sessionPromiseRef.current = null; }
    setIsConnected(false);
  };

  useEffect(() => {
     if(isLive) startSession();
     return () => stopSession();
  }, [isLive]);

  if (!isLive) {
      return (
          <ModuleView 
            feature={feature} 
            onBack={onBack} 
            onLaunchLive={() => setIsLive(true)} 
          />
      );
  }

  return (
    <div className="relative h-full w-full bg-black overflow-hidden flex flex-col items-center justify-center">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-90" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsLive(false)}
                        className="pointer-events-auto p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20 text-white hover:bg-white/20 transition-all"
                        title="Close Camera"
                    >
                        <Icons.ArrowLeft size={20} />
                    </button>
                    <div className="bg-lime-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-lime-500/30 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-lime-400 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-lime-100 text-xs font-bold uppercase tracking-wider">
                            {isConnected ? 'Plant Doctor Live' : 'Connecting...'}
                        </span>
                    </div>
                </div>
            </div>

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
                    <div className="flex gap-2 items-end h-12 mb-4">
                         <div className={`transition-all duration-200 w-2 bg-white rounded-full ${userSpeaking ? 'h-12' : 'h-3 opacity-30'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-white rounded-full ${userSpeaking ? 'h-8' : 'h-3 opacity-30'}`}></div>
                         <div className="w-4"></div>
                         <div className={`transition-all duration-200 w-2 bg-lime-400 rounded-full ${modelSpeaking ? 'h-12' : 'h-3 opacity-50'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-lime-400 rounded-full ${modelSpeaking ? 'h-8' : 'h-3 opacity-50'}`}></div>
                         <div className={`transition-all duration-200 w-2 bg-lime-400 rounded-full ${modelSpeaking ? 'h-10' : 'h-3 opacity-50'}`}></div>
                    </div>

                    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-full max-w-md text-center">
                         <p className="text-lime-100 text-sm font-medium animate-pulse">
                             {modelSpeaking ? "Diagnosing..." : "Listening & Watching..."}
                         </p>
                    </div>

                    <button 
                        onClick={() => setIsLive(false)}
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
