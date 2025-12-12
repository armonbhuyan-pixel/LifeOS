
import React, { useState, useEffect, useRef } from 'react';
import { AppFeature, ChatMessage } from '../types';
import { interactWithFeature, transcribeAudio, generateSpeech } from '../services/geminiService';
import * as Icons from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ModuleViewProps {
  feature: AppFeature;
  onBack: () => void;
  onLaunchLive?: () => void;
}

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

export const ModuleView: React.FC<ModuleViewProps> = ({ feature, onBack, onLaunchLive }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; mimeType: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  
  // Audio Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const IconComponent = (Icons as any)[feature.icon] || Icons.Activity;

  // Reset state when switching features
  useEffect(() => {
    const userName = localStorage.getItem('lifeos_username');
    const initialText = userName 
      ? `Hi ${userName}. ${feature.initialMessage}`
      : feature.initialMessage;

    setMessages([{
      role: 'model',
      text: initialText,
      timestamp: Date.now()
    }]);
    setInputValue('');
    setSelectedFile(null);
    stopPlayback();
    stopCamera();
  }, [feature]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedFile]);

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode }
      });
      setCameraStream(stream);
      setShowCamera(true);
      // Wait for ref to update
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error("Camera access denied", err);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Re-trigger camera when facing mode changes while active
  useEffect(() => {
    if (showCamera) {
      startCamera();
    }
  }, [facingMode]);

  const capturePhoto = () => {
    if (!cameraVideoRef.current) return;
    
    const video = cameraVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setSelectedFile({
        uri: dataUrl,
        mimeType: 'image/jpeg'
      });
    }
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Data URL result
        const result = reader.result as string;
        setSelectedFile({
            uri: result,
            mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearFile = () => {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePrint = (content: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\n/g, '<br/>');

      printWindow.document.write(`
        <html>
          <head>
            <title>Medical Report - LifeOS</title>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; padding: 40px; color: #333; max-width: 800px; mx-auto; }
              h1 { border-bottom: 2px solid #333; padding-bottom: 10px; font-size: 24px; color: #0f172a; }
              h2 { color: #0891b2; margin-top: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; font-size: 18px; }
              strong { color: #0f172a; }
              .header { margin-bottom: 30px; }
              .meta { font-size: 0.9em; color: #64748b; margin-bottom: 20px; }
              .content { font-size: 14px; }
              .disclaimer { margin-top: 50px; padding: 15px; background: #fff7ed; border-left: 4px solid #f97316; color: #9a3412; font-size: 0.85em; font-style: italic; }
              .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 0.8em; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="header">
                <h1>Medical Analysis Report</h1>
                <div class="meta">Generated by LifeOS Medical Lens • ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
            </div>
            
            <div class="content">
              ${formattedContent}
            </div>
            
            <div class="disclaimer">
              <strong>Disclaimer:</strong> This report was generated by AI analysis. Handwriting interpretation and medical identification may contain errors. This document is for informational purposes only and does not constitute medical advice. Please verify all details with a qualified healthcare professional or pharmacist.
            </div>

            <div class="footer">
                LifeOS AI Companion
            </div>
            <script>
              window.onload = () => { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleDownloadPdf = (content: string) => {
    const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\n/g, '<br/>');

    const element = document.createElement('div');
    element.innerHTML = `
        <div style="font-family: 'Helvetica', sans-serif; padding: 20px; color: #333;">
            <div style="margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                <h1 style="font-size: 24px; color: #0f172a; margin: 0;">Medical Analysis Report</h1>
                <div style="font-size: 0.9em; color: #64748b; margin-top: 5px;">Generated by LifeOS Medical Lens • ${new Date().toLocaleDateString()}</div>
            </div>
            <div style="font-size: 14px; line-height: 1.6;">
                ${formattedContent}
            </div>
            <div style="margin-top: 50px; padding: 15px; background: #fff7ed; border-left: 4px solid #f97316; color: #9a3412; font-size: 0.85em; font-style: italic;">
                <strong>Disclaimer:</strong> This report was generated by AI analysis. Interpretation may contain errors. Please verify with a professional.
            </div>
             <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 0.8em; color: #94a3b8;">
                LifeOS AI Companion
            </div>
        </div>
    `;

    const opt = {
      margin:       0.5,
      filename:     `Medical_Report_${new Date().toISOString().slice(0,10)}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // @ts-ignore
    if (window.html2pdf) {
        // @ts-ignore
        window.html2pdf().set(opt).from(element).save();
    } else {
        alert("PDF generator is initializing. Please try again in a few seconds.");
    }
  };

  // --- Gemini Audio Transcription Logic ---
  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setProcessingAudio(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); 
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = (reader.result as string).split(',')[1];
                try {
                    const text = await transcribeAudio(base64Audio, 'audio/webm');
                    if (text) {
                        setInputValue(prev => prev + (prev ? ' ' : '') + text.trim());
                    }
                } catch (error) {
                    console.error("Transcription failed", error);
                    alert("Failed to transcribe audio.");
                } finally {
                    setProcessingAudio(false);
                }
            };
            
            // Stop tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsListening(true);
    } catch (err) {
        console.error("Microphone access denied", err);
        alert("Please allow microphone access to use voice input.");
    }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isListening) {
          mediaRecorderRef.current.stop();
          setIsListening(false);
      }
  };

  const toggleListening = () => {
    if (isListening) {
        stopRecording();
    } else {
        startRecording();
    }
  };

  // --- Gemini TTS Logic ---
  const stopPlayback = () => {
      if (audioSourceRef.current) {
          try {
             audioSourceRef.current.stop();
          } catch(e) {
              // ignore
          }
          audioSourceRef.current = null;
      }
      setIsSpeaking(false);
  };

  const speakText = async (text: string) => {
    if (isSpeaking) {
       stopPlayback();
       return;
    }
    
    // Clean text
    const cleanText = text.replace(/[*_#`]/g, '');
    
    setIsSpeaking(true);
    try {
        const pcmBase64 = await generateSpeech(cleanText);
        if (!pcmBase64) throw new Error("No audio generated");

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        }
        
        const ctx = audioContextRef.current;
        const pcmData = decodeBase64(pcmBase64);
        
        // Convert PCM to AudioBuffer
        const dataInt16 = new Int16Array(pcmData.buffer);
        const float32Data = new Float32Array(dataInt16.length);
        for (let i = 0; i < dataInt16.length; i++) {
            float32Data[i] = dataInt16[i] / 32768.0;
        }

        const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
        audioBuffer.copyToChannel(float32Data, 0);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
        audioSourceRef.current = source;

    } catch (e) {
        console.error("TTS Failed", e);
        setIsSpeaking(false);
    }
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && !selectedFile) || isLoading || processingAudio) return;

    // Separate the raw Base64 from the Data URL for the API
    const rawBase64 = selectedFile ? selectedFile.uri.split(',')[1] : undefined;
    
    const userMsg: ChatMessage = { 
        role: 'user', 
        text: inputValue, 
        image: rawBase64, 
        mimeType: selectedFile?.mimeType,
        timestamp: Date.now() 
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setSelectedFile(null);
    if(fileInputRef.current) fileInputRef.current.value = '';
    
    setIsLoading(true);

    try {
      const result = await interactWithFeature(
          feature, 
          messages, 
          userMsg.text, 
          selectedFile && rawBase64 ? { data: rawBase64, mimeType: selectedFile.mimeType } : undefined
      );
      
      const modelMsg: ChatMessage = { 
        role: 'model', 
        text: result.text || "I'm thinking...", 
        image: result.image,
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, modelMsg]);
      
      if (['5', '8'].includes(feature.id) && modelMsg.text) {
          speakText(modelMsg.text);
      }

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        role: 'model',
        text: "Sorry, I couldn't process that request. Please check your connection or API key.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 relative">
      {/* 3D Header Bar */}
      <div className="bg-white/80 backdrop-blur-md px-4 py-4 sm:px-6 flex items-center justify-between sticky top-0 z-10 
                      border-b-4 border-slate-200 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-4">
          <button 
             onClick={onBack}
             className="p-2 -ml-2 hover:bg-slate-200/50 rounded-xl transition-colors text-slate-500"
             title="Back to Dashboard"
          >
             <Icons.ArrowLeft size={24} />
          </button>
          
          <div className={`p-2.5 rounded-2xl ${feature.bgColor} ${feature.color} shadow-inner border border-black/5 animate-in zoom-in duration-300 hidden sm:block`}>
            <IconComponent size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 animate-in slide-in-from-left-4 duration-500">
            <h1 className="text-xl font-extrabold text-slate-800 truncate">{feature.title}</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
             {onLaunchLive && (
               <button 
                 onClick={onLaunchLive}
                 className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 font-bold uppercase text-xs tracking-wider transition-all
                  bg-white border-rose-500 text-rose-500 hover:bg-rose-50 shadow-sm hover:scale-105 active:scale-95`}
               >
                  <Icons.Video size={14} /> Live Cam
               </button>
             )}
             
             {isSpeaking && (
                 <button onClick={stopPlayback} className="p-3 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 animate-pulse shadow-[0_3px_0_rgb(199,210,254)] active:translate-y-1 active:shadow-none transition-all" title="Stop Speaking">
                     <Icons.Volume2 size={20} />
                 </button>
             )}
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgb(16,185,129)]"></span>
                AI Active
            </div>
        </div>
      </div>

      {/* Chat Area - "Recessed" Look */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-slate-100/50">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
              <div className={`flex gap-4 max-w-[95%] sm:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* 3D Avatar */}
                <div className={`hidden sm:flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center border-b-4 transition-transform duration-300 hover:scale-110
                  ${msg.role === 'user' 
                    ? 'bg-slate-800 text-white border-slate-950 shadow-lg' 
                    : `bg-white ${feature.color} border-slate-200 shadow-[0_4px_10px_rgba(0,0,0,0.05)]`
                  }`}>
                  {msg.role === 'user' ? <Icons.User size={18} /> : <IconComponent size={18} />}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3">
                    {/* Media Bubble */}
                    {msg.image && (
                        <div className={`p-2 bg-white rounded-2xl border-2 border-slate-200 shadow-[0_6px_0_rgb(203,213,225)] max-w-[280px] sm:max-w-[350px] ${msg.role === 'user' ? 'self-end rotate-1' : 'self-start -rotate-1'} animate-in zoom-in-95 duration-500`}>
                            {(msg.mimeType?.startsWith('image/') || !msg.mimeType) ? (
                                <img src={`data:${msg.mimeType || 'image/jpeg'};base64,${msg.image}`} alt="Content" className="w-full h-auto rounded-xl" />
                            ) : (
                                <div className="flex items-center gap-3 p-4">
                                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">
                                        <Icons.FileText size={24} />
                                    </div>
                                    <span className="text-sm font-bold text-slate-700">Document Uploaded</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Text Bubble with 3D Pop */}
                    {msg.text && (
                        <div className={`p-5 rounded-2xl text-sm leading-relaxed relative group transition-all duration-300 hover:scale-[1.01]
                        ${msg.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none shadow-[0_6px_0_rgb(55,48,163)]' 
                            : 'bg-white text-slate-700 rounded-tl-none border-2 border-slate-200 shadow-[0_6px_0_rgb(203,213,225)]'
                        }`}>
                            <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-slate'}`}>
                                <ReactMarkdown 
                                components={{
                                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                    ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                    ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2" {...props} />
                                }}
                                >
                                {msg.text}
                                </ReactMarkdown>
                            </div>
                            
                            {/* Actions Row (Read Aloud / Print / Download) */}
                            {msg.role === 'model' && (
                                <div className="absolute -right-12 top-0 flex flex-col gap-2">
                                    <button 
                                        onClick={() => speakText(msg.text)} 
                                        className="p-2 bg-white rounded-full text-slate-400 hover:text-indigo-600 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                                        title="Read Aloud"
                                    >
                                        <Icons.Volume2 size={16} />
                                    </button>
                                    
                                    {feature.id === 'medical-lens' && (
                                        <>
                                            <button 
                                                onClick={() => handlePrint(msg.text)} 
                                                className="p-2 bg-white rounded-full text-slate-400 hover:text-cyan-600 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 delay-75"
                                                title="Print Report"
                                            >
                                                <Icons.Printer size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDownloadPdf(msg.text)} 
                                                className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-600 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 delay-100"
                                                title="Download PDF"
                                            >
                                                <Icons.Download size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start animate-fade-up">
               <div className="flex gap-4 max-w-[85%]">
                 <div className={`hidden sm:flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center bg-white border-2 border-slate-200 shadow-sm`}>
                    <IconComponent size={18} className="animate-pulse text-slate-400"/>
                 </div>
                 <div className="bg-white p-4 rounded-2xl rounded-tl-none border-2 border-slate-200 shadow-[0_4px_0_rgb(203,213,225)] flex gap-2 items-center h-14">
                    <span className="w-2.5 h-2.5 bg-slate-300 rounded-full animate-[bounce_1s_infinite]"></span>
                    <span className="w-2.5 h-2.5 bg-slate-300 rounded-full animate-[bounce_1s_infinite_0.2s]"></span>
                    <span className="w-2.5 h-2.5 bg-slate-300 rounded-full animate-[bounce_1s_infinite_0.4s]"></span>
                 </div>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            <div className="absolute top-4 right-4 z-20 flex gap-4">
                 <button onClick={switchCamera} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white">
                     <Icons.RefreshCw size={24} />
                 </button>
                 <button onClick={stopCamera} className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40">
                     <Icons.X size={24} />
                 </button>
            </div>
            
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                <video 
                  ref={cameraVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover" 
                />
            </div>
            
            <div className="p-8 bg-black/80 flex justify-center pb-12">
                <button 
                  onClick={capturePhoto} 
                  className="w-20 h-20 rounded-full bg-white border-4 border-slate-300 shadow-[0_0_0_4px_rgba(255,255,255,0.3)] active:scale-95 transition-transform"
                ></button>
            </div>
        </div>
      )}

      {/* 3D Input Console */}
      <div className="bg-white border-t-2 border-slate-200 p-4 sm:p-6 sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto relative flex flex-col gap-4">
           
           {/* File Preview Card */}
           {selectedFile && (
               <div className="relative inline-block w-24 h-24 rounded-xl overflow-hidden border-4 border-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] rotate-2 animate-in zoom-in-95 duration-300 bg-slate-100">
                   {selectedFile.mimeType.startsWith('image/') ? (
                       <img src={selectedFile.uri} alt="Preview" className="w-full h-full object-cover" />
                   ) : (
                       <div className="w-full h-full flex flex-col items-center justify-center text-red-500 bg-red-50">
                           <Icons.FileText size={32} />
                           <span className="text-[10px] font-bold mt-1 text-red-600">PDF</span>
                       </div>
                   )}
                   <button 
                     onClick={clearFile}
                     className="absolute top-1 right-1 bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600 transition-colors shadow-sm z-10"
                   >
                       <Icons.X size={12} strokeWidth={3} />
                   </button>
               </div>
           )}

           <div className="flex items-end gap-3">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                />
                
                {/* Upload Button */}
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 bg-slate-100 text-slate-500 border-2 border-slate-300 rounded-xl transition-all shadow-[0_4px_0_rgb(203,213,225)] hover:translate-y-[-2px] hover:shadow-[0_6px_0_rgb(203,213,225)] hover:text-indigo-600 active:translate-y-[2px] active:shadow-none shrink-0"
                    title="Upload File"
                >
                    <Icons.Paperclip size={24} strokeWidth={2.5} />
                </button>
                
                {/* Camera Button */}
                <button 
                    onClick={startCamera}
                    className="p-3.5 bg-slate-100 text-slate-500 border-2 border-slate-300 rounded-xl transition-all shadow-[0_4px_0_rgb(203,213,225)] hover:translate-y-[-2px] hover:shadow-[0_6px_0_rgb(203,213,225)] hover:text-indigo-600 active:translate-y-[2px] active:shadow-none shrink-0"
                    title="Take Photo"
                >
                    <Icons.Camera size={24} strokeWidth={2.5} />
                </button>

                {/* Microphone Button */}
                <button 
                    onClick={toggleListening}
                    disabled={processingAudio}
                    className={`p-3.5 rounded-xl border-2 transition-all shrink-0 shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:translate-y-[-2px] active:translate-y-[2px] active:shadow-none ${
                        isListening 
                        ? 'bg-rose-500 border-rose-600 text-white shadow-[0_4px_0_rgb(190,18,60)] animate-pulse' 
                        : processingAudio 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-400'
                          : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-indigo-600 shadow-[0_4px_0_rgb(203,213,225)]'
                    }`}
                    title="Voice Input"
                >
                    {isListening ? <Icons.Square size={24} fill="currentColor" /> : processingAudio ? <Icons.Loader2 size={24} className="animate-spin" /> : <Icons.Mic size={24} strokeWidth={2.5} />}
                </button>

                {onLaunchLive && (
                    <button 
                        onClick={onLaunchLive}
                        className="sm:hidden p-3.5 bg-rose-500 text-white border-2 border-rose-600 rounded-xl transition-all shadow-[0_4px_0_rgb(190,18,60)] hover:translate-y-[-2px] hover:shadow-[0_6px_0_rgb(190,18,60)] active:translate-y-[2px] active:shadow-none shrink-0"
                        title="Live Camera"
                    >
                        <Icons.Video size={24} strokeWidth={2.5} />
                    </button>
                )}

                <div className="relative flex-1 group">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={isListening ? "Listening..." : (processingAudio ? "Transcribing..." : feature.inputPlaceholder)}
                        className="w-full pl-5 pr-14 py-4 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 text-slate-800 placeholder-slate-400 font-medium shadow-inner"
                        autoFocus
                    />
                    <button 
                        onClick={handleSend}
                        disabled={(!inputValue.trim() && !selectedFile) || isLoading || processingAudio}
                        className={`absolute right-2 top-2 p-2 rounded-xl transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-[4px] ${
                        (inputValue.trim() || selectedFile)
                            ? 'bg-indigo-600 border-indigo-800 text-white hover:bg-indigo-500 scale-100 opacity-100' 
                            : 'bg-slate-200 border-slate-300 text-slate-400 cursor-not-allowed border-b-2 active:border-b-2 active:translate-y-0 opacity-70 scale-95'
                        }`}
                    >
                        <Icons.ArrowUp size={24} strokeWidth={3} />
                    </button>
                </div>
           </div>
        </div>
      </div>
    </div>
  );
};
