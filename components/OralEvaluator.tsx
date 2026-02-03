import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Type, FunctionDeclaration, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audio-utils';
import { Visualizer } from './Visualizer';
import { Mic, MicOff, PhoneOff, CheckCircle2, Circle, AlertCircle, RefreshCw, Lock } from 'lucide-react';

interface OralEvaluatorProps {
  onComplete: (score: number) => void;
  topic: string;
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

const displayQuestionTool: FunctionDeclaration = {
  name: 'display_question',
  description: 'Display a multiple choice question on the student\'s screen.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of 4 possible answers'
      },
      questionNumber: { type: Type.NUMBER }
    },
    required: ['question', 'options', 'questionNumber']
  }
};

export const OralEvaluator: React.FC<OralEvaluatorProps> = ({ onComplete, topic }) => {
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState('Initializing Evaluator...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Question State
  const [currentQuestion, setCurrentQuestion] = useState<{q: string, opts: string[], num: number} | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null); // Visual feedback only

  // Audio Context Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
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
        setStatus(retryCount > 0 ? `Connecting (Attempt ${retryCount + 1})...` : 'Initializing Evaluator...');

        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API Key missing");
        
        // 1. Request Microphone Permission FIRST
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

        // 2. Setup Audio
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (inputContextRef.current && inputContextRef.current.state !== 'closed') await inputContextRef.current.close();
        if (outputContextRef.current && outputContextRef.current.state !== 'closed') await outputContextRef.current.close();

        inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
        outputContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        
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
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
            tools: [{ functionDeclarations: [displayQuestionTool] }],
            systemInstruction: `
              You are the EVALUATOR AGENT. You are conducting an ORAL EXAM on the topic: "${topic}".
              
              PROTOCOL:
              1. Say "Welcome to your oral assessment. I will ask you 3 questions."
              2. Generate a multiple-choice question.
              3. Call tool 'display_question' with the question and options.
              4. SPEAK the question and the options out loud clearly.
              5. Wait for the user to answer verbally (e.g., "I think it's A" or "The answer is...").
              6. Evaluate the answer. Give short feedback ("Correct" or "Actually, it was...").
              7. Repeat for 3 total questions.
              8. After 3 questions, say "Exam Complete" and the final score.
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
                setStatus('Evaluator Active');
                setRetryCount(0);
              }
            },
            onmessage: async (msg: LiveServerMessage) => {
              // Handle Tool (UI Update)
              if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                  if (fc.name === 'display_question') {
                    const { question, options, questionNumber } = fc.args as any;
                    if (mounted) {
                      setCurrentQuestion({ q: question, opts: options, num: questionNumber });
                      setSelectedOption(null); // Reset selection
                    }
                    sessionPromise.then(s => s.sendToolResponse({
                      functionResponses: [{
                        id: fc.id, name: fc.name, response: { result: "displayed" }
                      }]
                    }));
                  }
                }
              }

              // Handle Audio Output
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
              }
            },
            onclose: () => { 
                if (mounted) {
                    setConnected(false);
                    connectedRef.current = false;
                    setStatus('Session Closed');
                }
            },
            onerror: (e) => { 
                console.error(e);
                if (mounted) {
                    setConnected(false);
                    connectedRef.current = false;
                    
                    const errStr = String(e);
                    const isNetworkError = errStr.includes("Network error") || errStr.includes("Failed to fetch") || errStr.includes("Internal error occurred");

                    if (isNetworkError) {
                       if (retryCount < 5) {
                          setStatus('Network unstable. Retrying...');
                          setTimeout(() => setRetryCount(c => c + 1), 2000);
                          return;
                       } else {
                          setError("Sensei is unable to connect. Please check your internet connection.");
                          return;
                       }
                    }

                    if (retryCount < 3) {
                        setStatus('Connection unstable. Retrying...');
                        setTimeout(() => setRetryCount(c => c + 1), 2000);
                    } else {
                        setError("Internal connection error. Please try again.");
                    }
                }
            }
          }
        });

        // Audio Input
        processor.onaudioprocess = (e) => {
          if (!micActiveRef.current || !connectedRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const blob = createPcmBlob(inputData);
          sessionPromise.then(s => {
             if (connectedRef.current) {
                 s.sendRealtimeInput({ media: blob });
             }
          }).catch(() => {});
        };

        cleanupSession = () => {
            connectedRef.current = false;
            sessionPromise.then(s => s.close());
        };

      } catch (err: any) {
        if (mounted) {
           // Suppress console error if it's the expected MICROPHONE_DENIED
           if (err.message !== "MICROPHONE_DENIED") {
              console.error("Initialization Error:", err);
           }
           
           if (err.message === "MICROPHONE_DENIED") {
              setError("MICROPHONE_DENIED");
              return;
           }
           if (err.message?.includes("Microphone access denied") || err.name === 'NotAllowedError') {
              setError("MICROPHONE_DENIED");
              return; 
           }
           
           const isNetworkError = err.message?.includes("Network error") || err.message?.includes("Failed to fetch");
           const isUnavailable = err.message?.toLowerCase().includes("unavailable") || err.message?.includes("503") || err.message?.includes("Internal error") || isNetworkError;
           const maxRetries = isUnavailable ? 6 : 3;
           
           if (retryCount < maxRetries) {
              const delay = Math.min(2000 * Math.pow(2, retryCount), 30000);
              setStatus(isUnavailable ? `Network unstable. Retrying in ${delay/1000}s...` : 'Network error. Retrying...');
              setTimeout(() => setRetryCount(c => c + 1), delay);
           } else {
              setError(err.message || "Network Error");
           }
        }
      }
    };

    startSession();

    return () => {
      mounted = false;
      connectedRef.current = false;
      if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
        inputContextRef.current.close();
      }
      if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
        outputContextRef.current.close();
      }
      
      // Cleanup media stream
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      
      if (cleanupSession) cleanupSession();
    };
  }, [topic, retryCount]);

  const handleManualRetry = () => {
    setError(null);
    setRetryCount(0);
  };

  if (error === "MICROPHONE_DENIED") {
     return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 bg-red-900/20 rounded-xl border border-red-500">
            <Lock className="w-16 h-16 text-red-500" />
            <h3 className="text-2xl font-bold text-red-500">Microphone Blocked</h3>
            <p className="text-white text-center">
                Please click the lock icon 🔒 in your browser address bar and enable Microphone access.
            </p>
            <div className="flex space-x-4">
                <button onClick={handleManualRetry} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
                    I've Enabled It
                </button>
                <button onClick={() => onComplete(0)} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold">
                    Back
                </button>
            </div>
        </div>
     );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 bg-red-900/20 rounded-xl border border-red-500">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <h3 className="text-2xl font-bold text-red-500">Assessment Error</h3>
        <p className="text-white">{error}</p>
        <div className="flex space-x-4">
            <button onClick={handleManualRetry} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold flex items-center space-x-2">
                <RefreshCw className="w-5 h-5" />
                <span>Retry</span>
            </button>
            <button onClick={() => onComplete(0)} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
                Exit Exam
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-gray-950 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
           <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
           <span className="font-bold text-red-500 tracking-wider">ORAL EXAM IN PROGRESS</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">{status}</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Question UI */}
        <div className="flex-1 p-8 flex flex-col justify-center max-w-2xl mx-auto z-10">
          {currentQuestion ? (
            <div className="animate-fade-in space-y-6">
              <h2 className="text-xl text-yellow-500 font-bold mb-2">Question {currentQuestion.num}</h2>
              <h3 className="text-3xl font-bold leading-tight">{currentQuestion.q}</h3>
              
              <div className="grid gap-3 pt-4">
                {currentQuestion.opts.map((opt, idx) => (
                  <div 
                    key={idx}
                    className={`p-4 rounded-xl border-2 flex items-center space-x-4 transition-all ${
                      selectedOption === idx 
                        ? 'border-yellow-500 bg-yellow-500/10' 
                        : 'border-gray-800 bg-gray-900/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${
                      selectedOption === idx ? 'border-yellow-500 text-yellow-500' : 'border-gray-600 text-gray-600'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span className="text-lg">{opt}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-gray-500 text-sm animate-pulse mt-4">
                Listening for your answer...
              </p>
            </div>
          ) : (
             <div className="text-center text-gray-500">
               <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
               <p className="text-xl">Waiting for Evaluator...</p>
             </div>
          )}
        </div>

        {/* Right: Agent Visualizer Sidebar */}
        <div className="w-80 bg-black border-l border-gray-800 flex flex-col justify-between p-6">
           <div className="space-y-6">
             <div>
               <div className="text-xs font-bold text-gray-500 mb-2">EVALUATOR VOICE</div>
               <Visualizer analyser={outputAnalyserRef.current} isActive={true} color="#ef4444" />
             </div>
             <div>
               <div className="text-xs font-bold text-gray-500 mb-2">YOUR VOICE</div>
               <Visualizer analyser={inputAnalyserRef.current} isActive={micActive} color="#3b82f6" />
             </div>
           </div>

           <div className="space-y-3">
              <button 
                onClick={() => setMicActive(!micActive)}
                className={`w-full py-3 rounded-lg flex items-center justify-center space-x-2 font-bold ${
                  micActive ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                <span>{micActive ? 'Mic On' : 'Mic Off'}</span>
              </button>
              
              <button onClick={() => onComplete(0)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 font-bold flex items-center justify-center space-x-2">
                 <PhoneOff className="w-5 h-5" />
                 <span>End Exam</span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};