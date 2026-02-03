import React, { useState } from 'react';
import { BookOpen, Upload, ChevronRight, ChevronDown, CheckCircle, Play, FileText, LayoutList, GraduationCap, Loader2 } from 'lucide-react';
import { ExamPlan, ExamTopic } from '../types';
import { generateExamPlan } from '../services/planner';

interface ExamPortalProps {
  onStartExamLesson: (examName: string, subject: string, chapter: string, topic: string) => void;
  examData: ExamPlan | null;
  setExamData: (data: ExamPlan) => void;
  completedTopics: string[]; // List of topic IDs
}

export const ExamPortal: React.FC<ExamPortalProps> = ({ onStartExamLesson, examData, setExamData, completedTopics }) => {
  const [isSetupMode, setIsSetupMode] = useState(!examData);
  const [examName, setExamName] = useState('');
  const [rawSyllabus, setRawSyllabus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!examName || !rawSyllabus) return;
    setIsGenerating(true);
    try {
      const plan = await generateExamPlan(examName, rawSyllabus);
      setExamData(plan);
      setIsSetupMode(false);
    } catch (e) {
      alert("Failed to process syllabus. Please try again.");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setRawSyllabus(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const calculateProgress = () => {
    if (!examData) return 0;
    let total = 0;
    let completed = 0;
    examData.subjects.forEach(sub => {
      sub.chapters.forEach(chap => {
        chap.topics.forEach(top => {
          total++;
          if (completedTopics.includes(top.id)) completed++;
        });
      });
    });
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  if (isSetupMode) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-black">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-4">
             <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl">
                <GraduationCap className="w-10 h-10 text-white" />
             </div>
             <h1 className="text-3xl font-bold text-white">Exam Syllabus Manager</h1>
             <p className="text-gray-400">Upload your official syllabus. I will create a structured learning playlist.</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
             <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Exam Name</label>
                <input 
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. GATE Computer Science, JEE Advanced"
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                />
             </div>
             <div>
                <div className="flex justify-between items-center mb-2">
                   <label className="text-sm font-bold text-gray-400">Official Syllabus</label>
                   <div className="relative">
                      <input 
                         type="file" 
                         accept=".txt,.md,.csv,.json"
                         onChange={handleFileUpload} 
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <button className="flex items-center space-x-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 px-3 py-1.5 rounded border border-blue-500/30 transition-colors">
                         <Upload className="w-3 h-3" />
                         <span>Upload Text File</span>
                      </button>
                   </div>
                </div>
                <textarea 
                  value={rawSyllabus}
                  onChange={(e) => setRawSyllabus(e.target.value)}
                  placeholder="Paste syllabus text here or upload a file (txt, md, csv)..."
                  className="w-full h-64 bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none font-mono text-sm"
                />
             </div>
             <button 
                onClick={handleGenerate}
                disabled={isGenerating || !examName || !rawSyllabus}
                className={`w-full py-4 rounded-lg font-bold flex items-center justify-center space-x-2 transition-all ${
                   isGenerating ? 'bg-gray-800 text-gray-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50'
                }`}
             >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LayoutList className="w-5 h-5" />}
                <span>{isGenerating ? 'Structuring Playlist...' : 'Create Exam Playlist'}</span>
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
       {/* Playlist Sidebar */}
       <div className="w-1/3 bg-gray-900/30 border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-gray-900/50">
             <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-white truncate">{examData?.examName}</h2>
                <button onClick={() => setIsSetupMode(true)} className="text-xs text-gray-500 hover:text-white">New Exam</button>
             </div>
             <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                <div 
                   className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500" 
                   style={{ width: `${calculateProgress()}%` }} 
                />
             </div>
             <div className="text-xs text-right mt-1 text-gray-400">{calculateProgress()}% Syllabus Covered</div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
             {examData?.subjects.map(subject => (
                <div key={subject.id} className="border border-gray-800 bg-black rounded-lg overflow-hidden mb-2">
                   <button 
                      onClick={() => setExpandedSubject(expandedSubject === subject.id ? null : subject.id)}
                      className="w-full p-3 flex items-center justify-between bg-gray-900 hover:bg-gray-800 transition-colors"
                   >
                      <span className="font-bold text-sm text-gray-200">{subject.title}</span>
                      {expandedSubject === subject.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                   </button>
                   
                   {expandedSubject === subject.id && (
                      <div className="bg-black border-t border-gray-800">
                         {subject.chapters.map(chapter => (
                            <div key={chapter.id}>
                               <button 
                                  onClick={() => setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id)}
                                  className="w-full p-2 pl-4 flex items-center space-x-2 text-sm text-gray-400 hover:text-white hover:bg-gray-900/50 transition-colors border-b border-gray-900"
                               >
                                  {expandedChapter === chapter.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  <span className="truncate">{chapter.title}</span>
                               </button>
                               
                               {expandedChapter === chapter.id && (
                                  <div className="pl-8 pr-2 py-2 space-y-1 bg-gray-900/20">
                                     {chapter.topics.map(topic => {
                                        const isCompleted = completedTopics.includes(topic.id);
                                        return (
                                           <button 
                                              key={topic.id}
                                              onClick={() => onStartExamLesson(examData.examName, subject.title, chapter.title, topic.title)}
                                              className={`w-full text-left text-xs p-2 rounded flex items-center space-x-2 transition-all ${
                                                 isCompleted ? 'text-green-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                                              }`}
                                           >
                                              {isCompleted ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <div className="w-3 h-3 rounded-full border border-gray-600 flex-shrink-0" />}
                                              <span className="truncate">{topic.title}</span>
                                           </button>
                                        );
                                     })}
                                  </div>
                               )}
                            </div>
                         ))}
                      </div>
                   )}
                </div>
             ))}
          </div>
       </div>

       {/* Main Content Placeholder */}
       <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black text-center space-y-6">
          <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center animate-pulse">
             <BookOpen className="w-10 h-10 text-gray-600" />
          </div>
          <div>
             <h2 className="text-2xl font-bold text-white mb-2">Select a Topic from the Playlist</h2>
             <p className="text-gray-400 max-w-md mx-auto">
                Navigate through Subjects and Chapters on the left. Click on a topic to start a dedicated exam-focused session.
             </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 mt-8">
             <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Zero Hallucination Policy</span>
             </div>
             <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>Strict Syllabus Adherence</span>
             </div>
          </div>
       </div>
    </div>
  );
};