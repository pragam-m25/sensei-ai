import React, { useState, useRef, useEffect } from 'react';
import { Github, Upload, Play, FileText, Code, GitBranch, Layers, Loader2, Mic, Eye } from 'lucide-react';

interface RepoExplainerProps {
  onStartExplainer: (repoUrl: string, context: string, mode: 'SPEAKING' | 'VISUALS') => void;
  onCancel: () => void;
}

export const RepoExplainer: React.FC<RepoExplainerProps> = ({ onStartExplainer, onCancel }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [repoContext, setRepoContext] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleStart = (mode: 'SPEAKING' | 'VISUALS') => {
    if (!repoUrl && !repoContext) return;
    setIsAnalyzing(true);
    // Simulate a brief analysis delay for UX
    setTimeout(() => {
        onStartExplainer(repoUrl, repoContext, mode);
        if (mountedRef.current) {
            setIsAnalyzing(false);
        }
    }, 1500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setRepoContext(prev => prev + "\n\n--- UPLOADED FILE CONTENT ---\n" + (event.target?.result as string));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-black flex flex-col items-center justify-center">
      <div className="max-w-3xl w-full space-y-8">
        
        <div className="text-center space-y-4">
           <div className="w-20 h-20 bg-gray-900 rounded-2xl mx-auto flex items-center justify-center shadow-2xl border border-gray-800">
              <Github className="w-10 h-10 text-white" />
           </div>
           <h1 className="text-3xl font-bold text-white">GitHub Repo Explainer</h1>
           <p className="text-gray-400 max-w-lg mx-auto">
             I am your Senior Developer Mentor. Paste a repository link or content, and I'll explain the project purpose, architecture, and code flow in simple terms.
           </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-8 shadow-xl">
           
           {/* URL Input */}
           <div>
              <label className="block text-sm font-bold text-gray-400 mb-2 flex items-center space-x-2">
                  <Github className="w-4 h-4" />
                  <span>Repository URL</span>
              </label>
              <input 
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/project"
                className="w-full bg-black border border-gray-700 rounded-lg p-4 text-white focus:border-blue-500 outline-none transition-all"
              />
           </div>

           {/* Context Input */}
           <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="text-sm font-bold text-gray-400 flex items-center space-x-2">
                    <FileText className="w-4 h-4" />
                    <span>Repo Context (File Structure / Key Code)</span>
                 </label>
                 <div className="relative">
                    <input 
                       type="file" 
                       accept=".txt,.md,.json,.js,.ts,.py,.java,.cpp,.c,.h,.cs,.go,.rs"
                       onChange={handleFileUpload} 
                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <button className="flex items-center space-x-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 px-3 py-1.5 rounded border border-blue-500/30 transition-colors">
                       <Upload className="w-3 h-3" />
                       <span>Upload File</span>
                    </button>
                 </div>
              </div>
              <textarea 
                value={repoContext}
                onChange={(e) => setRepoContext(e.target.value)}
                placeholder="Paste the file tree, README content, or important code snippets here to help me understand the project better..."
                className="w-full h-48 bg-black border border-gray-700 rounded-lg p-4 text-white focus:border-blue-500 outline-none font-mono text-sm"
              />
           </div>

           {/* Info Grid */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col items-center text-center space-y-2">
                  <Play className="w-5 h-5 text-green-400" />
                  <span className="text-xs text-gray-300 font-bold">Project Purpose</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col items-center text-center space-y-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span className="text-xs text-gray-300 font-bold">File Structure</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col items-center text-center space-y-2">
                  <GitBranch className="w-5 h-5 text-purple-400" />
                  <span className="text-xs text-gray-300 font-bold">Code Flow</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col items-center text-center space-y-2">
                  <Code className="w-5 h-5 text-orange-400" />
                  <span className="text-xs text-gray-300 font-bold">Dependencies</span>
              </div>
           </div>

           {/* Actions */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                  onClick={() => handleStart('SPEAKING')}
                  disabled={isAnalyzing || (!repoUrl && !repoContext)}
                  className={`py-4 rounded-lg font-bold flex items-center justify-center space-x-2 transition-all border ${
                    isAnalyzing || (!repoUrl && !repoContext)
                    ? 'bg-gray-800 text-gray-500 border-gray-700' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:shadow-lg hover:shadow-blue-500/20 border-blue-500'
                  }`}
              >
                  {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
                  <span>Explain by Speaking</span>
              </button>

              <button 
                  onClick={() => handleStart('VISUALS')}
                  disabled={isAnalyzing || (!repoUrl && !repoContext)}
                  className={`py-4 rounded-lg font-bold flex items-center justify-center space-x-2 transition-all border ${
                     isAnalyzing || (!repoUrl && !repoContext)
                     ? 'bg-gray-800 text-gray-500 border-gray-700' 
                     : 'bg-gray-800 text-white hover:bg-gray-700 border-gray-600'
                  }`}
              >
                  {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
                  <span>Explain by Visuals</span>
              </button>
           </div>
           
           <p className="text-center text-xs text-gray-500">
              Voice mode uses Hinglish. Visual mode creates a structured guide.
           </p>
        </div>
      </div>
    </div>
  );
};