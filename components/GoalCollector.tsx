import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionDeclaration, Type, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audio-utils';
import { Visualizer } from './Visualizer';
import { Mic, MicOff, X, Volume2, AlertCircle, RefreshCw, Lock } from 'lucide-react';

interface GoalCollectorProps {
  onGoalCaptured: (topic: string) => void;
  onCancel: () => void;
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

const setTopicTool: FunctionDeclaration = {
  name: 'set_topic',
  description: 'Set the comprehensive learning course topic.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: "The broad course topic (e.g. 'Complete Python Course', 'World History')" },
    },
    required: ['topic']
  }
};

export const GoalCollector: React.FC<GoalCollectorProps> = ({ onGoalCaptured, onCancel }) => {
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState('Connecting to Sensei...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Audio Context Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Logic Refs
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micActiveRef = useRef(micActive);
  const connectedRef = useRef(false);

  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);

  useEffect(() => {
    let mounted = true;
    let cleanupSession: (() => void) | null = null;

    const startSession = async () => {
      try {
        setError(null);
        setStatus(retryCount > 0 ? `Connecting (Attempt ${retryCount + 1})...` : 'Connecting to Sensei...');
        
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API Key missing");

        // 1. Request Mic Permission FIRST (Critical for AudioContext to work)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
           throw new Error("Microphone access is not supported in this browser or context. Please use HTTPS.");
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Prevent race condition if component unmounted while waiting for permission
            if (!mounted) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
        } catch (e: any) {
            const errName = e.name || '';
            const errMsg = e.message || String(e);
            
            if (
                errName === 'NotAllowedError' || 
                errName === 'PermissionDeniedError' || 
                errName === 'SecurityError' ||
                errMsg.toLowerCase().includes('permission denied') || 
                errMsg.toLowerCase().includes('denied') ||
                errMsg.toLowerCase().includes('blocked')
            ) {
                throw new Error("MICROPHONE_DENIED");
            }
            console.error("Mic Error:", e);
            throw e;
        }

        setConnected(false);
        connectedRef.current = false;
        const ai = new GoogleGenAI({ apiKey });

        // 2. Initialize AudioContexts AFTER permission granted
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        if (inputContextRef.current && inputContextRef.current.state !== 'closed') await inputContextRef.current.close();
        if (outputContextRef.current && outputContextRef.current.state !== 'closed') await outputContextRef.current.close();

        inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
        outputContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        
        // 3. Setup Audio Processing Chain
        if (inputContextRef.current.state === 'suspended') await inputContextRef.current.resume();
        if (outputContextRef.current.state === 'suspended') await outputContextRef.current.resume();

        inputAnalyserRef.current = inputContextRef.current.createAnalyser();
        outputAnalyserRef.current = outputContextRef.current.createAnalyser();

        const source = inputContextRef.current.createMediaStreamSource(stream);
        const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
        
        source.connect(inputAnalyserRef.current);
        inputAnalyserRef.current.connect(processor);
        processor.connect(inputContextRef.current.destination);

        const config = {
          model: MODEL_NAME,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            tools: [{ functionDeclarations: [setTopicTool] }],
            systemInstruction: `
              You are SENSEI's Intake Agent.
              
              GOAL: Identify the SINGLE major topic the user wants to master (e.g., "Python", "Physics", "Spanish").
              
              PROTOCOL:
              1. Greet warmly: "What would you like to master today?"
              2. Listen.
              3. If the user mentions a topic, IMMEDIATELY call 'set_topic' with the BROAD subject name.
                 - Example: User says "I want to learn pandas", you set topic "Python Data Science".
                 - Example: User says "Mujhe Python seekhni hai", you set topic "Python Programming".
              4. Do NOT ask follow-up questions about "basics" or "advanced". We always build a full course.
            `,
          },
        };

        const sessionPromise = ai.live.connect({
          ...config,
          callbacks: {
            onopen: () => {
              if (mounted) {
                setConnected(true);
                connectedRef.current = true;
                setStatus('Listening...');
                setRetryCount(0);
              }
            },
            onmessage: async (msg: LiveServerMessage) => {
              if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                  if (fc.name === 'set_topic') {
                    const { topic } = fc.args as any;
                    if (mounted) {
                       sessionPromise.then(s => s.sendToolResponse({
                          functionResponses: [{
                            id: fc.id, name: fc.name, response: { result: "ok" }
                          }]
                       }));
                       setTimeout(() => {
                           if (mounted) onGoalCaptured(topic);
                       }, 500);
                    }
                  }
                }
              }

              const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioData && outputContextRef.current) {
                const ctx = outputContextRef.current;
                const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                
                if (outputAnalyserRef.current) {
                   source.connect(outputAnalyserRef.current);
                   outputAnalyserRef.current.connect(ctx.destination);
                } else {
                   source.connect(ctx.destination);
                }

                const now = ctx.currentTime;
                if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
                source.onended = () => sourcesRef.current.delete(source);
              }

              if (msg.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }
            },
            onclose: () => {
              if (mounted) {
                 setConnected(false);
                 connectedRef.current = false;
                 setStatus('Disconnected');
              }
            },
            onerror: (e) => {
              console.error(e);
              if (mounted) {
                setConnected(false);
                connectedRef.current = false;
                
                const errStr = String(e);
                
                // Critical Errors that should not retry
                if (errStr.includes("not implemented") || errStr.includes("not supported") || errStr.includes("404")) {
                    setError("The AI Voice Model is not available. Please check your API key project settings.");
                    return;
                }
                
                // Retryable Errors
                if (errStr.includes("Internal error") || errStr.includes("Network error") || errStr.includes("Failed to fetch") || errStr.includes("503")) {
                     if (retryCount < 5) {
                        setStatus('Network glitch. Auto-reconnecting...');
                        setTimeout(() => setRetryCount(c => c + 1), 1500 * (retryCount + 1));
                        return;
                     }
                }

                if (retryCount < 3) {
                   setStatus('Reconnecting...');
                   setTimeout(() => setRetryCount(c => c + 1), 2000);
                } else {
                   setError("Connection failed. Please check your network.");
                }
              }
            }
          }
        });

        processor.onaudioprocess = (e) => {
          if (!micActiveRef.current || !connectedRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const blob = createPcmBlob(inputData);
          sessionPromise.then(s => {
            if (connectedRef.current) s.sendRealtimeInput({ media: blob });
          }).catch(() => {});
        };

        cleanupSession = () => {
          connectedRef.current = false;
          sessionPromise.then(s => s.close()).catch(() => {});
        };

      } catch (err: any) {
         if (mounted) {
            // Suppress console error for expected MICROPHONE_DENIED
            if (err.message !== "MICROPHONE_DENIED") {
                console.error(err);
            }

            if (err.message === "MICROPHONE_DENIED") {
                setError("MICROPHONE_DENIED");
                return;
            }
            if (err.message?.includes("Microphone access denied") || err.name === 'NotAllowedError') {
                setError("MICROPHONE_DENIED");
                return; 
            }
            
            const errStr = err.message || String(err);
            if (errStr.includes("not implemented") || errStr.includes("not supported")) {
                 setError("The AI Voice Model is not available. Please check your API key project settings.");
                 return;
            }

            // General Retry
            if (retryCount < 3) {
                const delay = 1000 * (retryCount + 1);
                setStatus('Connection error. Retrying...');
                setTimeout(() => setRetryCount(c => c + 1), delay);
            } else {
                setError(err.message || "Failed to connect.");
            }
         }
      }
    };

    startSession();

    return () => {
      mounted = false;
      connectedRef.current = false;
      
      // Cleanup audio context
      if (inputContextRef.current && inputContextRef.current.state !== 'closed') inputContextRef.current.close();
      if (outputContextRef.current && outputContextRef.current.state !== 'closed') outputContextRef.current.close();
      
      // Cleanup media stream
      if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
         streamRef.current = null;
      }
      
      sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
      if (cleanupSession) cleanupSession();
    };
  }, [retryCount]);

  const handleManualRetry = () => {
    setError(null);
    setRetryCount(0);
  };

  if (error === "MICROPHONE_DENIED") {
     return (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6">
            <div className="bg-red-900/20 border border-red-500 rounded-xl p-8 max-w-md text-center space-y-4">
                <Lock className="w-12 h-12 text-red-500 mx-auto" />
                <h3 className="text-xl font-bold text-red-500">Microphone Blocked</h3>
                <p className="text-gray-300">
                    We need access to your microphone to talk to Sensei. <br/>
                    <span className="text-white font-bold block mt-2">Please click the lock icon 🔒 in your browser address bar and enable Microphone access.</span>
                </p>
                <div className="flex justify-center space-x-4">
                    <button 
                        onClick={handleManualRetry}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors"
                    >
                        I've Enabled It
                    </button>
                    <button 
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
     );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6">
        <div className="bg-red-900/20 border border-red-500 rounded-xl p-8 max-w-md text-center space-y-4">
           <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
           <h3 className="text-xl font-bold text-red-500">Connection Error</h3>
           <p className="text-gray-300">{error}</p>
           <div className="flex justify-center space-x-4">
              <button 
                onClick={handleManualRetry}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold flex items-center space-x-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button 
                onClick={onCancel}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors"
              >
                Cancel
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-fade-in">
       <button 
         onClick={onCancel}
         className="absolute top-6 right-6 p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
       >
         <X className="w-6 h-6" />
       </button>

       <div className="max-w-md w-full text-center space-y-8">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(234,179,8,0.3)] animate-pulse">
             <Volume2 className="w-12 h-12 text-black" />
          </div>

          <div className="space-y-4">
             <h2 className="text-3xl font-bold text-white">{status === 'Listening...' ? "I'm listening..." : status}</h2>
             <p className="text-gray-400 text-lg">Just say what you want to learn.</p>
          </div>

          <div className="h-32 bg-gray-900/50 rounded-xl border border-gray-800 p-4 flex items-center justify-center relative overflow-hidden">
             {/* Visualizer for User Voice */}
             <div className="absolute inset-0 flex items-center justify-center opacity-50">
                 <Visualizer analyser={inputAnalyserRef.current} isActive={micActive} color="#60A5FA" />
             </div>
             {/* Visualizer for AI Voice */}
             <div className="absolute inset-0 flex items-center justify-center mix-blend-screen">
                 <Visualizer analyser={outputAnalyserRef.current} isActive={true} color="#FACC15" />
             </div>
          </div>

          <button 
             onClick={() => setMicActive(!micActive)}
             className={`px-8 py-4 rounded-full font-bold text-lg flex items-center justify-center space-x-3 mx-auto transition-all ${
               micActive ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30' : 'bg-gray-700 text-gray-400'
             }`}
          >
             {micActive ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
             <span>{micActive ? 'Mic On' : 'Muted'}</span>
          </button>
       </div>
    </div>
  );
};