import React, { useState, useMemo } from 'react';
import { X, FileText, Map, List, Tv, Zap, Download, ChevronLeft, ChevronRight, Copy, Check, Terminal } from 'lucide-react';

export interface Resource {
  type: 'NOTES' | 'MIND_MAP' | 'QUIZ' | 'SLIDES' | 'CHEAT_SHEET';
  title: string;
  content: string;
}

interface ResourceViewerProps {
  resource: Resource | null;
  onClose: () => void;
}

export const ResourceViewer: React.FC<ResourceViewerProps> = ({ resource, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  // 2. SLIDES RENDERER HOOK
  const slides = useMemo(() => {
    if (!resource || resource.type !== 'SLIDES') return [];
    // Enhanced regex to catch more slide formats
    const rawSlides = resource.content.split(/(?=#{1,3} ?Slide \d+:?|^\*?\*?Slide \d+:?|^Slide \d+:?)/im).filter(s => s.trim().length > 10);
    return rawSlides.length > 0 ? rawSlides : [resource.content];
  }, [resource]);

  if (!resource) return null;

  const handleSave = () => {
    const blob = new Blob([resource.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${resource.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(resource.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getIcon = () => {
    switch (resource.type) {
      case 'NOTES': return <FileText className="w-6 h-6 text-blue-400" />;
      case 'MIND_MAP': return <Map className="w-6 h-6 text-purple-400" />;
      case 'QUIZ': return <List className="w-6 h-6 text-green-400" />;
      case 'SLIDES': return <Tv className="w-6 h-6 text-orange-400" />;
      case 'CHEAT_SHEET': return <Zap className="w-6 h-6 text-yellow-400" />;
      default: return <FileText className="w-6 h-6" />;
    }
  };

  // --- PARSERS & RENDERERS ---

  const parseInline = (text: string): React.ReactNode => {
      // CLEANUP: Remove LaTeX $ signs as requested to avoid confusion
      const cleanText = text.replace(/\\?\$+/g, ''); 

      const parts = cleanText.split(/(\*\*.*?\*\*|`.*?`)/g);
      return parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-yellow-400 font-bold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
              return <code key={i} className="bg-gray-800/80 px-1.5 py-0.5 rounded text-sm text-cyan-400 font-mono border border-cyan-900/30">{part.slice(1, -1)}</code>;
          }
          return part;
      });
  };

  // 1. MARKDOWN RENDERER (Notes, Cheat Sheets, Quizzes)
  const renderMarkdown = () => {
    const lines = resource.content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];
    let inTable = false;
    let codeBuffer: string[] = [];
    let inCodeBlock = false;

    const flushTable = (keyIndex: number) => {
        if (tableBuffer.length > 0) {
            elements.push(renderTable(tableBuffer, `table-${keyIndex}`));
            tableBuffer = [];
            inTable = false;
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Code Block Handling
        if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                elements.push(
                    <div key={`code-${index}`} className="my-6 bg-[#0d0d0d] border border-gray-800 rounded-lg p-5 overflow-x-auto relative group shadow-lg">
                        <div className="absolute top-2 right-2 p-1 bg-gray-800/50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <Terminal className="w-4 h-4 text-gray-400" />
                        </div>
                        <pre className="font-mono text-sm text-blue-300/90 leading-relaxed">
                            {codeBuffer.join('\n')}
                        </pre>
                    </div>
                );
                codeBuffer = [];
                inCodeBlock = false;
            } else {
                // Start code block
                flushTable(index);
                inCodeBlock = true;
            }
            return;
        }

        if (inCodeBlock) {
            codeBuffer.push(line);
            return;
        }

        // Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed.match(/^(-|_|\*){3,}$/)) {
            flushTable(index);
            elements.push(<hr key={`hr-${index}`} className="my-10 border-gray-800" />);
            return;
        }

        // Headers
        if (trimmed.startsWith('#')) {
            flushTable(index);
            const level = trimmed.match(/^#+/)?.[0].length || 0;
            const content = trimmed.replace(/^#+\s*/, '');
            // Stylish Headers
            const sizeClasses = ['text-4xl pb-4 border-b border-gray-800/50 mt-10 mb-6', 'text-2xl mt-8 mb-4', 'text-xl mt-6 mb-3', 'text-lg font-bold mt-4 mb-2'];
            
            // Gradient for H1
            const colorClass = level === 1 
                ? 'bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-white' 
                : level === 2 ? 'text-white' : 'text-blue-200';

            elements.push(
                <div key={`header-${index}`} className={`font-bold tracking-tight ${sizeClasses[level-1] || 'text-base'} ${colorClass}`}>
                    {parseInline(content)}
                </div>
            );
            return;
        }

        // List Items
        if (trimmed.match(/^[-*]\s/) || trimmed.match(/^\d+\.\s/)) {
            flushTable(index);
            const isOrdered = trimmed.match(/^\d+\.\s/);
            elements.push(
                <div key={`list-${index}`} className="flex items-start mb-3 ml-2 group">
                    <span className={`mr-3 mt-1.5 flex-shrink-0 transition-transform group-hover:scale-110 ${isOrdered ? 'text-gray-500 font-mono text-xs font-bold' : 'text-blue-500'}`}>
                        {isOrdered ? trimmed.split(' ')[0] : '❖'} 
                    </span>
                    <span className="text-gray-300 leading-relaxed text-base/7 group-hover:text-gray-200 transition-colors">
                        {parseInline(trimmed.replace(/^[-*]\s|^\d+\.\s/, ''))}
                    </span>
                </div>
            );
            return;
        }

        // Tables
        if (trimmed.startsWith('|')) {
            inTable = true;
            tableBuffer.push(trimmed);
            return;
        } else if (inTable) {
            flushTable(index); // End of table block
        }

        // Empty lines
        if (!trimmed) {
            flushTable(index);
            elements.push(<div key={`empty-${index}`} className="h-3" />);
            return;
        }

        // Default Paragraph
        elements.push(
            <p key={`p-${index}`} className="mb-4 text-gray-300 leading-7 text-base/relaxed">
                {parseInline(trimmed)}
            </p>
        );
    });
    
    flushTable(lines.length); // Final flush
    
    return (
        <div className="h-full overflow-y-auto p-8 md:p-16 text-gray-300 custom-scrollbar bg-gradient-to-b from-[#050505] to-[#0a0a0a]">
            <div className="max-w-4xl mx-auto pb-24 space-y-1">
                {elements}
            </div>
        </div>
    );
  };

  const renderTable = (rows: string[], key: string) => {
      // Basic table parsing
      const headerRow = rows[0];
      const separatorRow = rows[1];
      const hasSeparator = separatorRow && separatorRow.replace(/[\s|:-]/g, '').length === 0;
      const dataRows = rows.slice(hasSeparator ? 2 : 1);
      
      const parseRow = (r: string) => r.split('|').map(c => c.trim()).filter(c => c);

      const headers = parseRow(headerRow);
      
      return (
          <div key={key} className="my-8 overflow-x-auto rounded-xl border border-gray-800 bg-[#0F0F10] shadow-xl">
              <table className="min-w-full divide-y divide-gray-800">
                  <thead className="bg-gray-900/80">
                      <tr>
                          {headers.map((h, i) => (
                              <th key={i} className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800">
                                  {parseInline(h)}
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                      {dataRows.map((row, rI) => {
                          const cells = parseRow(row);
                          if (cells.length === 0) return null;
                          return (
                              <tr key={rI} className="hover:bg-gray-800/30 transition-colors">
                                  {cells.map((cell, cI) => (
                                      <td key={cI} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 border-r border-gray-800/30 last:border-0">
                                          {parseInline(cell)}
                                      </td>
                                  ))}
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      );
  };

  const renderSlides = () => {
    const currentContent = slides[slideIndex] || "";
    const lines = currentContent.split('\n');
    const titleLine = lines.find(l => l.match(/Slide \d+/i)) || lines[0];
    const bodyLines = lines.filter(l => l !== titleLine);
    const title = titleLine.replace(/#{1,3}|Slide \d+:?|\*+/gi, '').trim();

    return (
      <div className="flex flex-col h-full bg-[#111] rounded-xl overflow-hidden border border-gray-800">
        {/* Slide Content Area - Added overflow-y-auto to allow scrolling if content is long, preventing controls from being pushed off-screen */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-gradient-to-br from-gray-900 to-black relative custom-scrollbar">
          <div className="absolute top-4 right-4 text-xs font-mono text-gray-600">
             {slideIndex + 1} / {slides.length}
          </div>
          
          <div className="max-w-4xl w-full mx-auto flex flex-col justify-center min-h-full">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-8 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-yellow-600 drop-shadow-sm text-center">
              {title}
            </h2>
            <div className="text-left space-y-4 text-lg text-gray-300 mx-auto w-full bg-gray-800/30 p-8 rounded-2xl border border-gray-700/50 backdrop-blur-sm shadow-xl">
               {bodyLines.map((line, i) => {
                 const cleanLine = line.trim();
                 if (!cleanLine) return null;
                 if (cleanLine.toLowerCase().includes('speaker notes')) return null;
                 
                 const isBullet = cleanLine.startsWith('-') || cleanLine.startsWith('*');
                 const content = cleanLine.replace(/^[-*#]+ /, '');
                 
                 return (
                   <div key={i} className={`flex items-start ${isBullet ? 'pl-4' : ''}`}>
                      {isBullet && (
                        <span className="mr-3 text-orange-500 mt-1.5 flex-shrink-0">•</span>
                      )}
                      <span className={`${cleanLine.startsWith('#') ? 'font-bold text-orange-200' : ''} leading-relaxed`}>
                        {/* Parse inline to render bold (**) correctly instead of displaying raw asterisks */}
                        {parseInline(content)}
                      </span>
                   </div>
                 );
               })}
            </div>
          </div>
        </div>

        {/* Navigation Bar - Fixed height, won't be pushed out */}
        <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-6 shrink-0 z-10">
           <button 
             onClick={() => setSlideIndex(Math.max(0, slideIndex - 1))}
             disabled={slideIndex === 0}
             className="p-3 rounded-full hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
           >
             <ChevronLeft className="w-6 h-6 text-white" />
           </button>
           
           <div className="flex space-x-2">
             {slides.map((_, i) => (
               <button 
                 key={i}
                 onClick={() => setSlideIndex(i)}
                 className={`h-2 rounded-full transition-all duration-300 ${i === slideIndex ? 'bg-orange-500 w-8' : 'bg-gray-700 hover:bg-gray-600 w-2'}`}
               />
             ))}
           </div>

           <button 
             onClick={() => setSlideIndex(Math.min(slides.length - 1, slideIndex + 1))}
             disabled={slideIndex === slides.length - 1}
             className="p-3 rounded-full hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
           >
             <ChevronRight className="w-6 h-6 text-white" />
           </button>
        </div>
      </div>
    );
  };

  const renderMindMap = () => {
    const lines = resource.content.split('\n').filter(l => l.trim().length > 0);
    const nodes = lines.map((line, idx) => {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const level = Math.floor(indent / 2);
      // Clean up markers
      const content = line.trim().replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').replace(/\\?\$+/g, '');
      return { id: idx, level, content };
    });

    return (
      <div className="h-full overflow-y-auto p-8 bg-[#0F0F10] custom-scrollbar">
         <div className="max-w-4xl mx-auto space-y-4">
            {nodes.map((node, i) => (
              <div 
                key={i} 
                className="relative flex items-center group"
                style={{ marginLeft: `${node.level * 3}rem` }}
              >
                {node.level > 0 && (
                   <div className="absolute -left-6 top-1/2 w-6 h-px bg-gray-700" />
                )}
                {node.level > 0 && (
                   <div className="absolute -left-6 -top-4 bottom-1/2 w-px bg-gray-700" />
                )}

                <div className={`
                  relative z-10 px-6 py-3 rounded-xl border transition-all duration-300
                  ${node.level === 0 
                     ? 'bg-purple-900/20 border-purple-500 text-purple-200 text-xl font-bold shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                     : node.level === 1
                     ? 'bg-gray-800 border-gray-600 text-white text-lg font-semibold shadow-lg'
                     : 'bg-gray-900 border-gray-800 text-gray-300 text-base'
                  }
                  hover:scale-[1.01] hover:border-purple-400/50 hover:shadow-lg
                `}>
                   {node.content}
                </div>
              </div>
            ))}
         </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-800 bg-black/60 backdrop-blur-md shrink-0 z-20">
           <div className="flex items-center space-x-4">
              <div className="p-3 bg-gray-800/80 rounded-xl shadow-inner hidden md:block">
                {getIcon()}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                   <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{resource.type.replace('_', ' ')}</div>
                   <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/30 text-blue-400 border border-blue-500/20">AI GENERATED</div>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate max-w-md md:max-w-xl">{resource.title}</h2>
              </div>
           </div>
           <button 
             onClick={onClose} 
             className="p-2 hover:bg-white/10 rounded-full transition-colors"
           >
             <X className="w-6 h-6 text-gray-400 hover:text-white" />
           </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[#050505]">
           {resource.type === 'SLIDES' && renderSlides()}
           {resource.type === 'MIND_MAP' && renderMindMap()}
           {resource.type !== 'SLIDES' && resource.type !== 'MIND_MAP' && renderMarkdown()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-black/60 backdrop-blur-md flex justify-between items-center shrink-0 z-20">
           <div className="hidden md:flex text-xs text-gray-600 font-mono items-center">
             <Zap className="w-3 h-3 mr-1 text-yellow-600" />
             Generated by Sensei-AI
           </div>
           <div className="flex space-x-3 w-full md:w-auto justify-end">
             <button 
               onClick={handleCopy}
               className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded-lg flex items-center space-x-2 transition-colors border border-gray-700"
             >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                <span className="hidden md:inline">{copied ? 'Copied' : 'Copy Text'}</span>
             </button>
             
             <button 
               onClick={handleSave}
               className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold rounded-lg flex items-center space-x-2 transition-colors border border-gray-700"
             >
                <Download className="w-4 h-4" />
                <span>Save</span>
             </button>
             
             <button onClick={onClose} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-black text-sm font-bold rounded-lg transition-colors shadow-lg shadow-yellow-900/20">
               Done
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};