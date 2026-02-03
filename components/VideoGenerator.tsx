import React, { useState, useEffect } from 'react';
import { Video, Loader2, Play, AlertCircle, Key, CheckCircle, Plus, ChevronRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface VideoGeneratorProps {
  onBack: () => void;
}

interface VideoItem {
  id: string;
  topic: string;
  url: string | null;
  status: 'generating' | 'completed' | 'failed';
  error?: string;
  timestamp: number;
}

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ onBack }) => {
  const [topicInput, setTopicInput] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [checkingKey, setCheckingKey] = useState<boolean>(true);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
        // Fallback for dev environments without AI Studio injection
        setHasApiKey(!!process.env.API_KEY);
    }
    setCheckingKey(false);
  };

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      await checkApiKey();
    }
  };

  const generateVideo = async () => {
    if (!topicInput.trim() || !hasApiKey) return;

    const newVideoId = Date.now().toString();
    const newVideo: VideoItem = {
      id: newVideoId,
      topic: topicInput,
      url: null,
      status: 'generating',
      timestamp: Date.now()
    };

    setVideos(prev => [newVideo, ...prev]);
    setTopicInput('');

    try {
      // Re-initialize AI with current key context
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing. Please select a key.");
      
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        Create a high-quality educational video about "${newVideo.topic}".
        
        Strict Educational Structure:
        1. Title: "${newVideo.topic}"
        2. Simple explanation for beginners (Hinglish/Simple English context).
        3. A clear visual example or analogy.
        4. Short recap.
        
        Style: Clean, modern motion graphics, clear text overlays, academic but engaging. 
        No distractions, no entertainment trends. Pure knowledge.
      `;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Update check logic
        try {
            operation = await ai.operations.getVideosOperation({ operation: operation });
        } catch (pollErr: any) {
            // Handle race condition "Requested entity was not found" by restarting or just waiting
            console.warn("Polling glitch, retrying...", pollErr);
            if (String(pollErr).includes("not found")) {
                 // Sometimes the operation ID needs a moment to propagate
                 await new Promise(resolve => setTimeout(resolve, 2000)); 
                 continue;
            }
            throw pollErr;
        }
      }

      if (operation.response?.generatedVideos?.[0]?.video?.uri) {
        const downloadLink = operation.response.generatedVideos[0].video.uri;
        
        // Fetch the video blob using the key
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        if (!response.ok) throw new Error("Failed to download video content");
        
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        setVideos(prev => prev.map(v => 
          v.id === newVideoId ? { ...v, status: 'completed', url: videoUrl } : v
        ));
      } else {
        throw new Error("No video generated in response");
      }

    } catch (err: any) {
      console.error("Video Generation Error:", err);
      
      let errorMsg = "Generation failed.";
      if (String(err).includes("Requested entity was not found")) {
          errorMsg = "Session expired or key invalid. Please re-select key.";
          setHasApiKey(false); // Force re-selection
      } else if (String(err).includes("429")) {
          errorMsg = "Quota exceeded. Please try again later.";
      }

      setVideos(prev => prev.map(v => 
        v.id === newVideoId ? { ...v, status: 'failed', error: errorMsg } : v
      ));
    }
  };

  if (checkingKey) {
      return <div className="flex h-full items-center justify-center bg-black"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gray-900/30 flex items-center justify-between">
         <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/50">
               <Video className="w-6 h-6 text-white" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-white tracking-tight">Sensei Micro-Lessons</h1>
               <p className="text-gray-400 text-xs">AI-Generated Educational Videos</p>
            </div>
         </div>
         {hasApiKey && (
             <div className="flex items-center space-x-2 px-3 py-1 bg-green-900/20 border border-green-500/30 rounded-full">
                 <CheckCircle className="w-3 h-3 text-green-500" />
                 <span className="text-xs text-green-500 font-bold">Premium Key Active</span>
             </div>
         )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {!hasApiKey ? (
           <div className="max-w-xl mx-auto mt-20 text-center p-8 bg-gray-900 border border-gray-800 rounded-2xl">
               <Key className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
               <h2 className="text-2xl font-bold text-white mb-4">Premium Feature Locked</h2>
               <p className="text-gray-400 mb-8 leading-relaxed">
                  Video generation requires a paid Google Cloud Project API key (Veo Model). 
                  Please select a billing-enabled project key to continue.
               </p>
               <button 
                  onClick={handleSelectKey}
                  className="px-8 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg transition-transform hover:scale-105 flex items-center justify-center space-x-2 mx-auto"
               >
                  <span>Select Paid API Key</span>
                  <ChevronRight className="w-4 h-4" />
               </button>
               <p className="mt-4 text-xs text-gray-500">
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-white">
                      View Billing Documentation
                  </a>
               </p>
           </div>
        ) : (
           <div className="max-w-5xl mx-auto space-y-12">
               
               {/* Input Section */}
               <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-400 uppercase tracking-wider">Generate New Lesson</label>
                  <div className="flex space-x-4">
                      <input 
                         value={topicInput}
                         onChange={(e) => setTopicInput(e.target.value)}
                         placeholder="e.g. 'Newton's Third Law', 'Python For Loops', 'Photosynthesis process'"
                         className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-6 py-4 text-lg text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                         onKeyDown={(e) => e.key === 'Enter' && generateVideo()}
                      />
                      <button 
                         onClick={generateVideo}
                         disabled={!topicInput.trim()}
                         className="px-8 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center space-x-2"
                      >
                         <Plus className="w-5 h-5" />
                         <span>Create Video</span>
                      </button>
                  </div>
                  <div className="flex items-start space-x-2 text-xs text-gray-500 mt-2">
                     <AlertCircle className="w-3 h-3 mt-0.5 text-yellow-500" />
                     <p>Videos are generated using Veo. Content is strictly educational. Accuracy verified by prompt engineering, but check critical facts.</p>
                  </div>
               </div>

               {/* Video Grid */}
               <div>
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                     <Play className="w-5 h-5 text-red-500" />
                     <span>Your Library</span>
                  </h3>
                  
                  {videos.length === 0 ? (
                      <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl">
                          <Video className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                          <p className="text-gray-500">No videos yet. Ask for a topic above.</p>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {videos.map((video) => (
                              <div key={video.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl transition-all hover:border-gray-700">
                                  {video.status === 'generating' ? (
                                      <div className="aspect-video flex flex-col items-center justify-center bg-black/50 space-y-4">
                                          <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                                          <div className="text-center">
                                              <p className="text-white font-bold">Creating Lesson...</p>
                                              <p className="text-xs text-gray-500 mt-1">Rendering physics & motion</p>
                                          </div>
                                      </div>
                                  ) : video.status === 'failed' ? (
                                      <div className="aspect-video flex flex-col items-center justify-center bg-red-900/10 space-y-2">
                                          <AlertCircle className="w-10 h-10 text-red-500" />
                                          <p className="text-red-400 font-bold">Generation Failed</p>
                                          <p className="text-xs text-red-500/50 px-4 text-center">{video.error}</p>
                                      </div>
                                  ) : (
                                      <div className="relative group">
                                         <video 
                                            src={video.url!} 
                                            controls 
                                            className="w-full aspect-video object-cover"
                                            poster="https://via.placeholder.com/640x360/111/333?text=Sensei+Video"
                                         />
                                      </div>
                                  )}
                                  
                                  <div className="p-4">
                                      <div className="flex items-start justify-between">
                                          <div>
                                              <h4 className="font-bold text-white text-lg">{video.topic}</h4>
                                              <p className="text-xs text-gray-500 mt-1">{new Date(video.timestamp).toLocaleTimeString()}</p>
                                          </div>
                                          {video.status === 'completed' && (
                                              <div className="px-2 py-1 bg-green-900/30 text-green-400 text-[10px] font-bold uppercase rounded border border-green-500/20">
                                                  Ready
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
               </div>
           </div>
        )}
      </div>
    </div>
  );
};