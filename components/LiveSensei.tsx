import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audio-utils';
import { Visualizer } from './Visualizer';
import { ResourceViewer, Resource } from './ResourceViewer';
import { Lesson } from '../types';
import { Mic, MicOff, PhoneOff, Volume2, RefreshCw, AlertCircle, BookOpen, FileText, Lock, Github, Code } from 'lucide-react';

interface LiveSenseiProps {
  lesson: Lesson;
  progress: any;
  onProgressUpdate: (p: any) => void;
  onComplete: (score: number) => void;
  onExit: () => void;
  // New Prop for Exam Mode
  examContext?: {
      examName: string;
      subject: string;
      chapter: string;
  };
  // New Prop for Repo Explainer Mode
  repoContext?: {
      repoUrl: string;
      context: string;
  };
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Tool to persistently update progress without breaking speech flow
const updateProgressTool: FunctionDeclaration = {
  name: 'update_progress',
  description: 'Update the learning progress state internally.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      subtopic: { type: Type.STRING, description: "Current subtopic being taught" },
      percentage: { type: Type.NUMBER, description: "Estimated completion percentage (0-100)" },
      lastPoint: { type: Type.STRING, description: "A brief summary of exactly where we are in the explanation" }
    },
    required: ['subtopic', 'percentage', 'lastPoint']
  }
};

// New Tool for Auto Learning Resources
const generateResourceTool: FunctionDeclaration = {
  name: 'generate_resource',
  description: 'Generate visual learning resources (Notes, Mind Maps, Quizzes, etc) for the student.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: ['NOTES', 'MIND_MAP', 'QUIZ', 'SLIDES', 'CHEAT_SHEET'], description: "Type of resource to generate" },
      title: { type: Type.STRING, description: "Title of the resource" },
      content: { type: Type.STRING, description: "Markdown text content of the resource" }
    },
    required: ['type', 'title', 'content']
  }
};

export const LiveSensei: React.FC<LiveSenseiProps> = ({ lesson, progress, onProgressUpdate, onComplete, onExit, examContext, repoContext }) => {
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState<string>('Initializing Sensei...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Resource State
  const [currentResource, setCurrentResource] = useState<Resource | null>(null);

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
        setStatus(retryCount > 0 ? `Connecting (Attempt ${retryCount + 1})...` : 'Initializing Sensei...');
        
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
            // Catch common permission error patterns
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
            // Only log if it's an unexpected error
            console.error("Mic Error:", e);
            throw e;
        }

        setConnected(false);
        connectedRef.current = false;
        const ai = new GoogleGenAI({ apiKey });

        // 2. Initialize AudioContexts
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

        // --- CONTEXT SWITCHING LOGIC ---
        
        // 1. STANDARD TEACHER
        let systemInstruction = `
              You are SENSEI, a dedicated AI Teacher for audio-first learning.
              CURRENT LESSON: "${lesson.title}"
              TEACHING PROTOCOLS:
              1. **ELI5 MODE**: Start simple. Use analogies.
              2. **CONTINUITY**: Resume EXACTLY where left off.
              3. **BEHAVIOR**: Calm, patient, human-like.
              4. **NO LATEX**: If you generate notes or resources, DO NOT use LaTeX ($) symbols. Use plain text.
        `;

        // 2. EXAM MENTOR
        if (examContext) {
            systemInstruction = `
              You are SENSEI-EXAM, a rigorous EXAM MENTOR for "${examContext.examName}".
              
              CONTEXT: 
              Subject: ${examContext.subject}
              Chapter: ${examContext.chapter}
              CURRENT TOPIC: "${lesson.title}"

              CRITICAL EXAM MODE RULES:

              1. **ATOMIC FOCUS**: 
                 - Teach ONLY "${lesson.title}".
                 - Do NOT summarize the whole chapter.

              2. **MANDATORY TEACHING FLOW**:
                 - **Step 1: CONCEPT**: Explain the concept clearly (Exam definition).
                 - **Step 2: EXAMPLE**: Provide one clear, solved example or scenario.
                 - **Step 3: KEY POINTS**: List 2-3 critical points to remember.
                 - **Step 4: QUIZ (MANDATORY)**: 
                    - Immediately after Step 3, you **MUST** call the tool \`generate_resource\` with \`type: 'QUIZ'\`.
                    - The quiz must have 5 MCQs based ONLY on "${lesson.title}".
                    - **NO LATEX ($)** in quiz questions. Use plain text for math.

              3. **QUIZ SPECIFICATIONS**:
                 - 5 Questions.
                 - 4 Options each.
                 - **ANSWERS HIDDEN**: Put the Answer Key at the very bottom of the resource.

              4. **INTERACTION**:
                 - Be professional, concise, and motivating.
            `;
        } 
        
        // 3. REPO EXPLAINER (VOICE MODE)
        if (repoContext) {
            systemInstruction = `
              You are a SENIOR DEVELOPER MENTOR explaining a GitHub repository.
              REPO URL: ${repoContext.repoUrl}
              
              MODE: VOICE EXPLANATION (SPEAKING)
              LANGUAGE: Simple Hinglish (Hindi + English mix).
              
              BEHAVIOR:
              - Explain Project Purpose -> High Level Flow -> Main Files.
              - Don't read code line by line.
              - NO LATEX ($) in any generated resources.
            `;
        }

        const config = {
          model: MODEL_NAME,
          config: {
            responseModalities: [Modality.AUDIO], 
            tools: [{ functionDeclarations: [updateProgressTool, generateResourceTool] }],
            systemInstruction: systemInstruction,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: examContext ? 'Fenrir' : 'Kore' } }, // Fenrir for Exam, Kore for Standard
            },
          },
        };

        const sessionPromise = ai.live.connect({
          ...config,
          callbacks: {
            onopen: () => {
              if (mounted) {
                setConnected(true);
                connectedRef.current = true;
                setStatus(repoContext ? 'Repo Explainer Active' : examContext ? 'Exam Session Live' : 'Sensei is Live');
                setRetryCount(0);
              }
            },
            onmessage: async (msg: LiveServerMessage) => {
              // HANDLE TOOLS
              if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                  // Progress Update
                  if (fc.name === 'update_progress') {
                    const args = fc.args as any;
                    if (mounted) {
                        onProgressUpdate(args);
                    }
                    sessionPromise.then(s => s.sendToolResponse({
                        functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }]
                    }));
                  }
                  // Resource Generation
                  else if (fc.name === 'generate_resource') {
                    const args = fc.args as any;
                    if (mounted) {
                        setCurrentResource({
                            type: args.type,
                            title: args.title,
                            content: args.content
                        });
                    }
                    sessionPromise.then(s => s.sendToolResponse({
                        functionResponses: [{ id: fc.id, name: fc.name, response: { result: "resource_displayed" } }]
                    }));
                  }
                }
              }

              // HANDLE AUDIO
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
                 setStatus('Session Paused');
              }
            },
            onerror: (e) => {
              console.error(e);
              if (mounted) {
                setConnected(false);
                connectedRef.current = false;
                const errStr = String(e);
                
                if (errStr.includes("not implemented") || errStr.includes("not supported") || errStr.includes("404")) {
                    setError("Voice Model Unavailable in Region.");
                    return;
                }

                const isNetworkError = errStr.includes("Network error") || errStr.includes("Failed to fetch") || errStr.includes("503") || errStr.includes("Internal error");
                
                if (isNetworkError && retryCount < 5) {
                   const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
                   setStatus(`Network glitch. Retrying in ${Math.round(delay/1000)}s...`);
                   setTimeout(() => setRetryCount(c => c + 1), delay);
                   return;
                }

                if (retryCount < 3) {
                   setStatus('Reconnecting...');
                   setTimeout(() => setRetryCount(c => c + 1), 2000);
                } else {
                   setError("Connection Lost. Please check network.");
                }
              }
            }
          }
        });

        processor.onaudioprocess = (e) => {
          if (!micActiveRef.current || !connectedRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const blob = createPcmBlob(inputData);
          sessionPromise.then(session => {
            if (connectedRef.current) session.sendRealtimeInput({ media: blob });
          }).catch(err => {});
        };

        cleanupSession = () => {
          connectedRef.current = false;
          sessionPromise.then(session => { if (typeof session.close === 'function') session.close(); }).catch(() => {});
        };

      } catch (err: any) {
        if (mounted) {
          // Suppress console error if it's the expected MICROPHONE_DENIED
          if (err.message !== "MICROPHONE_DENIED") {
             console.error("Session Error:", err);
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
          const isNetworkError = errStr.includes("Network error") || errStr.includes("Failed to fetch");
          
          if (isNetworkError && retryCount < 5) {
             const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
             setStatus(`Network unstable. Retrying in ${Math.round(delay/1000)}s...`);
             setTimeout(() => setRetryCount(c => c + 1), delay);
          } else if (retryCount < 3) {
             setTimeout(() => setRetryCount(c => c + 1), 2000);
          } else {
             setError("Connection Failed");
          }
        }
      }
    };

    startSession();

    return () => {
      mounted = false;
      connectedRef.current = false;
      if (inputContextRef.current && inputContextRef.current.state !== 'closed') inputContextRef.current.close();
      if (outputContextRef.current && outputContextRef.current.state !== 'closed') outputContextRef.current.close();
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
                <button onClick={onExit} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold">
                    Back to Dashboard
                </button>
            </div>
        </div>
     );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 bg-red-900/20 rounded-xl border border-red-500">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <h3 className="text-2xl font-bold text-red-500">Sensei Disconnected</h3>
        <p className="text-white text-center">{error}</p>
        <div className="flex space-x-4">
            <button onClick={handleManualRetry} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold flex items-center space-x-2">
                <RefreshCw className="w-5 h-5" />
                <span>Retry Connection</span>
            </button>
            <button onClick={onExit} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
              Return to Dashboard
            </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {currentResource && (
        <ResourceViewer 
          resource={currentResource} 
          onClose={() => setCurrentResource(null)} 
        />
      )}

      <div className={`flex flex-col h-full rounded-xl overflow-hidden shadow-2xl border ${examContext ? 'bg-[#0f1015] border-blue-900/50' : repoContext ? 'bg-black border-gray-800' : 'bg-gray-900 border-gray-800'}`}>
        {/* Header */}
        <div className="p-6 bg-black border-b border-gray-800 flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-2 mb-1">
               <BookOpen className={`w-4 h-4 ${examContext ? 'text-blue-500' : repoContext ? 'text-white' : 'text-yellow-500'}`} />
               <span className={`text-xs font-bold uppercase tracking-widest ${examContext ? 'text-blue-500' : repoContext ? 'text-white' : 'text-yellow-500'}`}>
                   {examContext ? 'EXAM MENTOR MODE' : repoContext ? 'REPO EXPLAINER MODE' : 'TEACHER MODE'}
               </span>
            </div>
            <h2 className="text-xl font-bold text-white">{lesson.title}</h2>
            {examContext && (
               <p className="text-gray-500 text-sm mt-1">{examContext.examName} • {examContext.subject}</p>
            )}
            {repoContext && (
               <p className="text-gray-500 text-sm mt-1 flex items-center space-x-1">
                  <Github className="w-3 h-3" />
                  <span>{repoContext.repoUrl || 'Local Context'}</span>
               </p>
            )}
            {!examContext && !repoContext && (
               <p className="text-gray-500 text-sm mt-1">Current: {progress.subtopic || 'Introduction'}</p>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'}`}>
            {status}
          </div>
        </div>

        {/* Visualizers */}
        <div className={`flex-1 flex flex-col items-center justify-center p-6 space-y-12 bg-gradient-to-b ${examContext ? 'from-[#0f1015] to-black' : repoContext ? 'from-black to-gray-900' : 'from-gray-900 to-black'}`}>
          
          {/* Sensei Visualizer */}
          <div className="w-full max-w-2xl space-y-4">
            <div className={`flex items-center justify-between mb-2 px-2 ${examContext ? 'text-blue-500/80' : repoContext ? 'text-white/80' : 'text-yellow-500/80'}`}>
              <div className="flex items-center space-x-2">
                  <Volume2 className="w-5 h-5" />
                  <span className="font-bold tracking-widest text-sm">SENSEI</span>
              </div>
              {connected && (
                  <span className="text-[10px] text-gray-500 font-mono flex items-center">
                      <FileText className="w-3 h-3 mr-1" />
                      ASK FOR NOTES OR QUIZZES
                  </span>
              )}
            </div>
            <div className="relative">
               <div className={`absolute -inset-1 blur-xl rounded-lg ${examContext ? 'bg-blue-500/20' : repoContext ? 'bg-white/10' : 'bg-yellow-500/20'}`}></div>
               <Visualizer analyser={outputAnalyserRef.current} isActive={true} color={examContext ? '#3B82F6' : repoContext ? '#ffffff' : '#EAB308'} />
            </div>
          </div>

          {/* User Visualizer */}
          <div className="w-full max-w-2xl space-y-4">
            <div className="flex items-center justify-between text-blue-500/80 mb-2 px-2">
               <div className="flex items-center space-x-2">
                  {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  <span className="font-bold tracking-widest text-sm">YOU</span>
               </div>
            </div>
            <div className="relative">
               <div className="absolute -inset-1 bg-blue-500/10 blur-xl rounded-lg"></div>
               <Visualizer analyser={inputAnalyserRef.current} isActive={micActive} color="#3B82F6" />
            </div>
          </div>

        </div>

        {/* Controls */}
        <div className="p-6 bg-black border-t border-gray-800 flex justify-center space-x-6">
          <button 
            onClick={() => setMicActive(!micActive)}
            className={`p-4 rounded-full transition-all duration-200 border ${
              micActive ? 'bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30' : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
          >
            {micActive ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button 
            onClick={onExit}
            className="px-8 py-4 bg-red-900/20 hover:bg-red-900/30 text-red-400 border border-red-900/50 font-bold rounded-lg text-sm flex items-center space-x-2 transition-all"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Session</span>
          </button>
        </div>
      </div>
    </>
  );
};