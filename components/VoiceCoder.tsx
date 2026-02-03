import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Type, FunctionDeclaration, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audio-utils';
import { Visualizer } from './Visualizer';
import { Mic, MicOff, Terminal, X, Sparkles, AlertCircle, RefreshCw, FileCode, Check, Lock } from 'lucide-react';

interface VoiceCoderProps {
  codeState: string;
  setCodeState: (code: string) => void;
  onExit: () => void;
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// --- Syntax Highlighting Logic ---
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator' | 'default';

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: 'text-purple-400 font-bold',
  string: 'text-green-400',
  comment: 'text-gray-500 italic',
  number: 'text-orange-400',
  function: 'text-blue-400',
  operator: 'text-white',
  default: 'text-gray-300',
};

const SYNTAX_PATTERNS: Record<string, { type: TokenType; regex: RegExp }[]> = {
  python: [
    { type: 'comment', regex: /#.*/g },
    { type: 'string', regex: /(['"])(?:(?!\1|\\).|\\.)*\1/g },
    { type: 'keyword', regex: /\b(def|class|return|if|elif|else|while|for|in|import|from|as|try|except|print|True|False|None|and|or|not|is|with|lambda)\b/g },
    { type: 'number', regex: /\b\d+(\.\d+)?\b/g },
    { type: 'function', regex: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\()/g },
    { type: 'operator', regex: /[\+\-\*\/=\<\>!&|]/g },
  ],
};

const highlightCode = (code: string) => {
  const patterns = SYNTAX_PATTERNS['python']; 

  if (!patterns) return [{ text: code, type: 'default' as TokenType }];

  const tokens: { start: number; end: number; type: TokenType }[] = [];
  
  patterns.forEach(({ type, regex }) => {
    let match;
    const re = new RegExp(regex);
    while ((match = re.exec(code)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const isOverlapped = tokens.some(t => 
        (start >= t.start && start < t.end) || (end > t.start && end <= t.end)
      );
      
      if (!isOverlapped) {
        tokens.push({ start, end, type });
      }
    }
  });

  tokens.sort((a, b) => a.start - b.start);

  const elements: { text: string; type: TokenType }[] = [];
  let lastIndex = 0;

  tokens.forEach(token => {
    if (token.start > lastIndex) {
      elements.push({ text: code.slice(lastIndex, token.start), type: 'default' });
    }
    elements.push({ text: code.slice(token.start, token.end), type: token.type });
    lastIndex = token.end;
  });

  if (lastIndex < code.length) {
    elements.push({ text: code.slice(lastIndex), type: 'default' });
  }

  return elements;
};

// --- Components ---

const CodeEditor: React.FC<{ code: string; isUpdating: boolean }> = ({ code, isUpdating }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isUpdating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [code, isUpdating]);

  const lines = useMemo(() => code.split('\n'), [code]);
  
  const highlightedLines = useMemo(() => {
    return lines.map(line => highlightCode(line));
  }, [lines]);

  return (
    <div className={`flex flex-col h-full bg-[#1e1e1e] rounded-lg border transition-all duration-500 overflow-hidden relative ${
      isUpdating ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'border-gray-800'
    }`}>
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-800 select-none">
        <div className="flex items-center space-x-2">
           <FileCode className={`w-4 h-4 ${isUpdating ? 'text-purple-400 animate-pulse' : 'text-blue-400'}`} />
           <span className="text-xs text-gray-300 font-mono">
             script.py
           </span>
           {isUpdating && <span className="ml-2 text-[10px] text-purple-400 font-bold uppercase tracking-wider animate-pulse">● Coding...</span>}
        </div>
        <div className="flex space-x-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 hover:bg-red-500/50 transition-colors" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 hover:bg-yellow-500/50 transition-colors" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 hover:bg-green-500/50 transition-colors" />
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-sm leading-6 custom-scrollbar relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex min-h-full">
          <div className="w-12 flex-shrink-0 bg-[#1e1e1e] border-r border-gray-800 text-right pr-3 pt-4 select-none text-gray-600">
            {lines.map((_, i) => (
              <div key={i} className="h-6 text-xs leading-6 opacity-50 hover:opacity-100 transition-opacity">
                {i + 1}
              </div>
            ))}
          </div>

          <div className="flex-1 pt-4 pl-4 pb-20 bg-[#1e1e1e]">
            {highlightedLines.map((tokens, lineIndex) => (
              <div key={lineIndex} className="h-6 whitespace-pre">
                {tokens.length === 0 ? <br/> : tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} className={TOKEN_COLORS[token.type]}>
                    {token.text}
                  </span>
                ))}
              </div>
            ))}
            {isUpdating && (
               <div className="h-6 w-2 bg-purple-500 inline-block animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

const updateEditorTool: FunctionDeclaration = {
  name: 'update_editor',
  description: 'Update the code editor content.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: {
        type: Type.STRING,
        description: 'The COMPLETE code content.',
      },
      explanation: {
        type: Type.STRING,
        description: 'Brief explanation of changes.',
      },
    },
    required: ['code'],
  },
};

export const VoiceCoder: React.FC<VoiceCoderProps> = ({ codeState, setCodeState, onExit }) => {
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState('Initializing Lab...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [lastExplanation, setLastExplanation] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const micActiveRef = useRef(micActive);
  const connectedRef = useRef(false);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);

  useEffect(() => {
    let mounted = true;
    let cleanupSession: (() => void) | null = null;

    const startSession = async () => {
      try {
        setError(null);
        setStatus(retryCount > 0 ? `Connecting (Attempt ${retryCount + 1})...` : 'Connecting to Sensei...');
        setConnected(false);
        connectedRef.current = false;
        
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

        const config = {
          model: MODEL_NAME,
          config: {
            responseModalities: [Modality.AUDIO],
            tools: [{ functionDeclarations: [updateEditorTool] }],
            systemInstruction: `
              You are Sensei-Coder, an autonomous coding tutor for developers relying on audio feedback.
              
              CURRENT CODE:
              \`\`\`python
              ${codeState}
              \`\`\`

              IMPORTANT SYSTEM UPGRADE - STABILITY RULES:

              1. **PERSISTENCE**: You MUST maintain the CODE_STATE. Do not lose previous code.
              2. **INCREMENTAL UPDATE**: Modify existing code incrementally. Do NOT rewrite the entire file unless explicitly asked to "start over" or "rewrite".
              3. **CONTEXT AWARE**: If user says "add a loop", add it logically to the existing structure.
              4. **EXPLANATION**: Explain your fixes/changes calmly and clearly.
              5. **TOOL USAGE**: You MUST call 'update_editor' every time you generate or modify code.
              6. **LANGUAGE**: Default English.

              Example: If user says "Fix error", analyze the code, fix it, and call 'update_editor'.
            `,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
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
                setStatus('Sensei is ready');
                setRetryCount(0);
              }
            },
            onmessage: async (msg: LiveServerMessage) => {
              // Tool Calls
              if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                  if (fc.name === 'update_editor') {
                    const { code, explanation } = fc.args as any;
                    if (mounted) {
                      setIsUpdating(true);
                      setCodeState(code);
                      setLastExplanation(explanation || 'Code updated');
                      setTimeout(() => { if (mounted) setIsUpdating(false); }, 1500);
                    }
                    sessionPromise.then(s => s.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }]
                    }));
                  }
                }
              }

              // Audio Output
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
                 setStatus('Session Disconnected');
              }
            },
            onerror: (e) => {
              console.error(e);
              if (mounted) {
                 const errStr = String(e);
                 const isNetworkError = errStr.includes("Network error") || errStr.includes("Failed to fetch") || errStr.includes("503") || errStr.includes("Internal error");

                 if (isNetworkError && retryCount < 5) {
                     const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
                     setStatus(`Connection unstable. Retrying in ${Math.round(delay/1000)}s...`);
                     setTimeout(() => setRetryCount(c => c + 1), delay);
                 } else if (retryCount < 3) {
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
                setError("Network Error");
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
         <h3 className="text-2xl font-bold text-red-500">Connection Lost</h3>
         <p className="text-white">{error}</p>
         <div className="flex space-x-4">
             <button onClick={handleManualRetry} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold flex items-center space-x-2">
                 <RefreshCw className="w-5 h-5" />
                 <span>Reconnect</span>
             </button>
             <button onClick={onExit} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
               Exit
             </button>
         </div>
       </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
      {/* Top Bar */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-900/50">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-white tracking-wide">Voice Coding Lab</h2>
            <div className="flex items-center space-x-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-gray-400 font-mono">{status}</span>
              {!connected && (
                <button 
                  onClick={handleManualRetry} 
                  className="ml-2 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-blue-400 flex items-center transition-colors"
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Reconnect
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
           <button onClick={onExit} className="p-2 hover:bg-gray-800 rounded-full transition-colors group">
             <X className="w-5 h-5 text-gray-500 group-hover:text-white" />
           </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor Area */}
        <div className="flex-1 bg-[#1e1e1e] p-4 overflow-hidden flex flex-col relative">
           <CodeEditor 
             code={codeState} 
             isUpdating={isUpdating} 
           />
        </div>

        {/* Sidebar / Visuals */}
        <div className="w-80 bg-black border-l border-gray-800 flex flex-col z-10">
          {/* Agent Visualizer */}
          <div className="p-6 border-b border-gray-800 bg-gray-900/30">
             <div className="flex items-center justify-between mb-3">
               <div className="text-xs font-bold text-purple-400 uppercase tracking-widest">Sensei-Coder</div>
               <div className="p-1 rounded bg-purple-500/10">
                 <Sparkles className="w-3 h-3 text-purple-400" />
               </div>
             </div>
             <Visualizer analyser={outputAnalyserRef.current} isActive={true} color="#a855f7" />
          </div>

          {/* User Visualizer */}
          <div className="p-6 border-b border-gray-800">
             <div className="flex items-center justify-between mb-3">
               <div className="text-xs font-bold text-blue-400 uppercase tracking-widest">Input Stream</div>
               {micActive && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
             </div>
             <Visualizer analyser={inputAnalyserRef.current} isActive={micActive} color="#3b82f6" />
          </div>

          {/* Status / Last Action */}
          <div className="p-6 flex-1 bg-gray-900/50 flex flex-col">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Session Log</div>
            {lastExplanation ? (
              <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 p-4 rounded-xl animate-fade-in">
                <div className="flex items-start space-x-3">
                   <div className="p-1.5 bg-purple-500/20 rounded-lg flex-shrink-0">
                      <Check className="w-4 h-4 text-purple-400" />
                   </div>
                   <p className="text-sm text-purple-100 leading-relaxed">{lastExplanation}</p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 italic space-y-2 border-l-2 border-gray-800 pl-4 py-2">
                <p>1. Say "Define a function"</p>
                <p>2. I will write it</p>
                <p>3. Say "Add error handling"</p>
                <p>4. I will modify it</p>
              </div>
            )}

            {error && (
               <div className="mt-auto bg-red-900/20 border border-red-500/30 p-4 rounded-lg">
                 <div className="flex items-start space-x-2 mb-2">
                   <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                   <p className="text-sm text-red-300 font-bold">Error</p>
                 </div>
                 <p className="text-xs text-red-400 mb-3">{error}</p>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 flex justify-center z-10">
        <button
          onClick={() => setMicActive(!micActive)}
          className={`flex items-center space-x-3 px-8 py-3 rounded-full font-bold transition-all transform hover:scale-105 ${
            micActive 
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-900/50' 
              : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
          }`}
        >
          {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          <span>{micActive ? 'Listening...' : 'Mic Muted'}</span>
        </button>
      </div>
    </div>
  );
};