import React, { useState, useEffect } from 'react';
import { Brain, Code, Terminal, CheckCircle, TrendingUp, BookOpen, ShieldCheck, Activity, LogIn, LayoutDashboard, User, Info, Lock, ChevronRight, FileText, Plus, List, Loader2, Library, Zap, Presentation, Network, HelpCircle, X, AlertCircle, GraduationCap, Github, Compass, Building2 } from 'lucide-react';
import { VoiceCoder } from './components/VoiceCoder';
import { LiveSensei } from './components/LiveSensei';
import { OralEvaluator } from './components/OralEvaluator';
import { GoalCollector } from './components/GoalCollector';
import { GuardianAgent } from './components/GuardianAgent';
import { ResourceViewer, Resource } from './components/ResourceViewer';
import { ExamPortal } from './components/ExamPortal';
import { RepoExplainer } from './components/RepoExplainer';
import { CareerCounselor } from './components/CareerCounselor';
import { CompanyReadiness } from './components/CompanyReadiness';
import { generateSyllabus } from './services/planner';
import { GoogleGenAI } from '@google/genai';
import { ExamPlan } from './types';

// --- TYPES ---
type Page = 'LOGIN' | 'ABOUT' | 'DASHBOARD' | 'TEACHER' | 'VOICE_CODING' | 'ASSESSMENT' | 'GOAL_INTAKE' | 'RESOURCES' | 'EXAM' | 'REPO_EXPLAINER' | 'CAREER' | 'READINESS';

interface UserProfile {
  name: string;
  isLoggedIn: boolean;
}

interface LearningProgress {
  topic: string;
  subtopic: string;
  percentage: number;
  lastPoint: string;
}

const GeneratingOverlay = () => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
    <Loader2 className="w-12 h-12 text-yellow-500 animate-spin mb-4" />
    <h3 className="text-xl font-bold text-white">Generating Content...</h3>
    <p className="text-gray-400">Consulting the archives</p>
  </div>
);

// --- APP COMPONENT ---
export default function App() {
  // 1. GLOBAL STATE PERSISTENCE
  const [page, setPage] = useState<Page>(() => (localStorage.getItem('sensei_page') as Page) || 'LOGIN');
  
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('sensei_user');
    return saved ? JSON.parse(saved) : { name: '', isLoggedIn: false };
  });

  const [progress, setProgress] = useState<LearningProgress>(() => {
    const saved = localStorage.getItem('sensei_progress');
    return saved ? JSON.parse(saved) : { topic: '', subtopic: '', percentage: 0, lastPoint: '' };
  });

  // Sidebar History State
  const [learningPaths, setLearningPaths] = useState<LearningProgress[]>(() => {
    const saved = localStorage.getItem('sensei_learning_paths');
    return saved ? JSON.parse(saved) : [];
  });

  const [codeState, setCodeState] = useState<string>(() => {
    return localStorage.getItem('sensei_code_state') || '# Sensei Voice Coding Environment\n# Start speaking to write code...';
  });

  const [syllabus, setSyllabus] = useState<any>(() => {
     const saved = localStorage.getItem('sensei_syllabus');
     return saved ? JSON.parse(saved) : null;
  });

  // EXAM STATE
  const [examData, setExamData] = useState<ExamPlan | null>(() => {
      const saved = localStorage.getItem('sensei_exam_data');
      return saved ? JSON.parse(saved) : null;
  });
  const [examCompletedTopics, setExamCompletedTopics] = useState<string[]>(() => {
      const saved = localStorage.getItem('sensei_exam_completed');
      return saved ? JSON.parse(saved) : [];
  });
  const [activeExamSession, setActiveExamSession] = useState<{examName: string, subject: string, chapter: string, topic: string} | null>(null);

  // REPO EXPLAINER STATE
  const [activeRepoSession, setActiveRepoSession] = useState<{repoUrl: string, context: string} | null>(null);

  // UI States
  const [currentResource, setCurrentResource] = useState<Resource | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 2. EFFECTS FOR PERSISTENCE
  useEffect(() => localStorage.setItem('sensei_page', page), [page]);
  useEffect(() => localStorage.setItem('sensei_user', JSON.stringify(user)), [user]);
  useEffect(() => localStorage.setItem('sensei_progress', JSON.stringify(progress)), [progress]);
  useEffect(() => localStorage.setItem('sensei_code_state', codeState), [codeState]);
  useEffect(() => {
     if (syllabus) localStorage.setItem('sensei_syllabus', JSON.stringify(syllabus));
  }, [syllabus]);
  useEffect(() => {
     if (examData) localStorage.setItem('sensei_exam_data', JSON.stringify(examData));
     localStorage.setItem('sensei_exam_completed', JSON.stringify(examCompletedTopics));
  }, [examData, examCompletedTopics]);

  // Sync current progress to learningPaths list
  useEffect(() => {
     if (progress.topic && user.isLoggedIn) {
        setLearningPaths(prev => {
           const existingIndex = prev.findIndex(p => p.topic === progress.topic);
           let newPaths;
           if (existingIndex >= 0) {
              newPaths = [...prev];
              newPaths[existingIndex] = progress;
           } else {
              newPaths = [...prev, progress];
           }
           localStorage.setItem('sensei_learning_paths', JSON.stringify(newPaths));
           return newPaths;
        });
     }
  }, [progress, user.isLoggedIn]);

  // 3. HANDLERS
  const handleLogin = (name: string) => {
    setUser({ name, isLoggedIn: true });
    setPage('DASHBOARD');
  };

  const handleLogout = () => {
    setUser({ name: '', isLoggedIn: false });
    setPage('LOGIN');
    localStorage.clear();
    window.location.reload();
  };

  const updateProgress = (newProgress: Partial<LearningProgress>) => {
    setProgress(prev => ({ ...prev, ...newProgress }));
  };

  const startNewTopic = async (topic: string) => {
    setIsGenerating(true);
    // Optimistic UI update
    const optimisticProgress = { topic: topic, subtopic: 'Generating Plan...', percentage: 0, lastPoint: 'Planning...' };
    setProgress(optimisticProgress);
    setSyllabus(null);
    setPage('DASHBOARD');

    try {
        const syllabusData = await generateSyllabus(topic);
        setSyllabus(syllabusData);
        
        const newProgress = { 
            topic: syllabusData.topic, 
            subtopic: syllabusData.lessons[0]?.title || 'Introduction', 
            percentage: 0, 
            lastPoint: 'Start of course' 
        };
        setProgress(newProgress);
    } catch (error) {
        console.error("Planner Error:", error);
        // Fallback if AI fails
        const fallbackSyllabus = {
            topic,
            lessons: [
                { id: '1', title: 'Introduction', keyConcepts: ['Basics'], status: 'active' },
                { id: '2', title: 'Core Concepts', keyConcepts: ['Fundamentals'], status: 'pending' },
                { id: '3', title: 'Practice', keyConcepts: ['Application'], status: 'pending' }
            ]
        };
        setSyllabus(fallbackSyllabus);
        setProgress({ topic, subtopic: 'Introduction', percentage: 0, lastPoint: 'Start' });
    } finally {
        setIsGenerating(false);
    }
  };

  const switchTopic = (path: LearningProgress) => {
    setProgress(path);
    setPage('DASHBOARD');
  };

  const handleStartExamLesson = (examName: string, subject: string, chapter: string, topic: string) => {
      setActiveExamSession({ examName, subject, chapter, topic });
      setActiveRepoSession(null);
      setPage('TEACHER');
  };

  const handleStartRepoSession = async (repoUrl: string, context: string, mode: 'SPEAKING' | 'VISUALS') => {
      if (mode === 'SPEAKING') {
          setActiveRepoSession({ repoUrl, context });
          setActiveExamSession(null);
          setPage('TEACHER');
      } else {
          // Visual Mode: Generate a static resource
          setIsGenerating(true);
          try {
              if (!process.env.API_KEY) throw new Error("API Key missing");
              const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
              
              const prompt = `
                You are a SENIOR DEVELOPER MENTOR explaining a codebase to a beginner.
                
                REPO URL: ${repoUrl}
                CONTEXT: ${context.substring(0, 20000)}
                
                TASK: Create a STRUCTURED VISUAL GUIDE for this project.
                
                FORMAT REQUIREMENTS (Markdown):
                
                # Project Purpose
                - Explain "Is project ka kaam kya hai" in simple, non-jargon language.
                - Use analogies if helpful.
                
                # File & Folder Structure
                - List key files/folders.
                - Explain the role of each important file (briefly).
                
                # Code Flow Diagram (Text-Based)
                - Create a flowchart using arrows (e.g., User -> App -> API).
                - Explain the step-by-step flow from start to end.
                
                # Key Dependencies
                - List important libraries.
                - Explain "Why a beginner needs this".
                
                RULES:
                - Use clear headings and bullet points.
                - Be concise but complete.
                - No long paragraphs.
                - Assume the user is a BEGINNER.
              `;

              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt,
              });

              if (response.text) {
                  setCurrentResource({
                      type: 'NOTES',
                      title: `Repo Guide: ${repoUrl.split('/').pop() || 'Project'}`,
                      content: response.text
                  });
              }
          } catch (e) {
              console.error(e);
              alert("Failed to generate visual guide. Please try voice mode.");
          } finally {
              setIsGenerating(false);
          }
      }
  };

  const handleGenerateResource = async (type: 'NOTES' | 'MIND_MAP' | 'QUIZ' | 'SLIDES' | 'CHEAT_SHEET', topic: string) => {
      if (isGenerating) return;
      setIsGenerating(true);
      
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
          try {
              if (!process.env.API_KEY) throw new Error("API Key missing");
              const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
              
              let basePrompt = "";
              let titlePrefix = "";
              
              // CRITICAL FIX: Robust Context Generation for All Modes
              let context = "";
              if (activeExamSession) {
                  context = `
                  STRICT CONTEXT: EXAM PREPARATION
                  Exam Name: ${activeExamSession.examName}
                  Subject: ${activeExamSession.subject}
                  Chapter: ${activeExamSession.chapter}
                  Specific Topic: ${topic}
                  Role: You are a strict Exam Mentor. Content must be rigorous, accurate, and aligned with the official syllabus.
                  `;
              } else if (activeRepoSession) {
                  context = `
                  STRICT CONTEXT: CODEBASE ANALYSIS
                  Repository: ${activeRepoSession.repoUrl}
                  Project Context: ${activeRepoSession.context.substring(0, 15000)}
                  Role: You are a Senior Developer creating onboarding documentation. Focus on architecture, data flow, and key components.
                  `;
              } else {
                  context = `
                  CONTEXT: Self-Paced Learning Path
                  Topic: ${progress.topic}
                  Subtopic: ${progress.subtopic}
                  Role: You are a friendly teacher (Sensei).
                  `;
              }

              switch(type) {
                  case 'NOTES':
                      basePrompt = `Create HIGHLY DETAILED, UNIVERSITY-LEVEL study notes for "${topic}". ${context} 
                      Structure:
                      1. **Executive Summary**: A high-level overview.
                      2. **Core Concepts**: Deep dive into the theory.
                      3. **Key Terminology**: Definitions of important terms.
                      4. **Detailed Explanations**: Break down complex ideas step-by-step.
                      5. **Real-world Examples**: Practical applications.
                      Format in clear Markdown. Make it visually structured.`;
                      titlePrefix = "Deep Dive Notes";
                      break;
                  case 'MIND_MAP':
                      basePrompt = `Create a text-based hierarchical mind map for "${topic}". ${context} Use indented bullet points to show relationships. Start from the central concept and branch out to at least 3 levels of depth. Use Markdown.`;
                      titlePrefix = "Mind Map";
                      break;
                  case 'QUIZ':
                      basePrompt = `Generate a Question Bank for "${topic}" with 10 questions. ${context} For each question, provide: The Question, 4 Options (A,B,C,D), The Correct Answer, and a brief Explanation. Format as a clear Markdown list.`;
                      titlePrefix = "Question Bank";
                      break;
                  case 'CHEAT_SHEET':
                      basePrompt = `Create a "Cheat Sheet" for "${topic}". ${context} This should be a dense, high-utility reference guide containing: Syntax/Formulas (if applicable), Quick Rules, Common Pitfalls, and Best Practices. Use tables and code blocks where possible.`;
                      titlePrefix = "Cheat Sheet";
                      break;
                  case 'SLIDES':
                      basePrompt = `Create a presentation outline for a lecture on "${topic}". ${context} Generate content for 5-7 slides. For each slide, provide: "Slide X: [Title]", "Bulleted Content", and "Speaker Notes". Format in Markdown.`;
                      titlePrefix = "Presentation Slides";
                      break;
              }

              const systemInstruction = `
IMPORTANT PRESENTATION UPGRADE

VISUAL QUALITY RULE
• Any content you generate (notes, PPTs, quizzes, mind maps, cheat sheets, question banks) MUST look clean, structured, and visually pleasing.
• Raw code-dump or plain text is NOT allowed.

FORMATTING RULES

1. NOTES
• Use clear headings and sub-headings (H1, H2, H3)
• Short bullet points (max 1–2 lines)
• Highlight key terms in **bold**
• Use separators (---) between sections
• Avoid long paragraphs

2. NO LATEX / DOLLAR SIGNS ($)
• Do NOT use LaTeX math delimiters like $x^2$ or $$x^2$$.
• The user finds $ signs confusing.
• Write math in plain text (e.g. "x squared", "integral of...") or use code blocks for complex formulas.

3. PPT CONTENT (SLIDES)
• Generate slide-wise content
• Each slide must have:
  - Clear title (format: "Slide X: Title")
  - 3–5 bullet points only
• No paragraphs on slides
• Slide flow must be logical and minimal

4. MIND MAPS
• Output in a hierarchical, tree-style structure using indentation
• Use indentation and bullets (- or *)
• Main topic -> subtopics -> details
• Must be easy to visualize mentally
• NO LaTeX symbols.

5. QUESTION BANK / QUIZZES
• Clearly separate: Easy, Medium, Hard
• Number questions properly
• Answers at the end, cleanly formatted

6. CODE IN NOTES
• Only include code when necessary
• Always wrap code in clean blocks (\`\`\`)
• Add a one-line explanation above code
• Do NOT mix code inside paragraphs

You are a specialized content generator. Output only the requested resource content in Markdown. Do not act as a conversational assistant.
`;

              const finalPrompt = `${systemInstruction}\n\nUSER REQUEST: ${basePrompt}`;

              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: finalPrompt, 
              });
              
              const text = response.text;
              if (!text) throw new Error("Empty response from AI");

              setCurrentResource({
                  type: type,
                  title: `${titlePrefix}: ${topic}`,
                  content: text
              });
              break; 
          } catch (e: any) {
              console.error(`Resource Error (Attempt ${retryCount + 1}):`, e);
              retryCount++;
              
              if (retryCount === maxRetries) {
                  const errString = e.message || String(e);
                  let userMessage = "Could not generate resource. Please try again.";
                  
                  if (errString.includes("Rpc failed") || errString.includes("xhr error") || errString.includes("Network error") || errString.includes("fetch")) {
                      userMessage = "Network connection failed. Please check your internet connection and try again.";
                  } else if (errString.includes("429")) {
                      userMessage = "Too many requests. Please wait a moment.";
                  } else if (errString.includes("404") || errString.includes("not implemented")) {
                      userMessage = "Model unavailable in your region. Please try again later.";
                  }
                  
                  alert(userMessage);
              } else {
                  await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
              }
          }
      }
      setIsGenerating(false);
  };

  // --- RENDER ---
  return (
    <GuardianAgent onReset={handleLogout}>
      {currentResource && (
        <ResourceViewer 
          resource={currentResource} 
          onClose={() => setCurrentResource(null)} 
        />
      )}
      
      {isGenerating && <GeneratingOverlay />}
      
      <div className="min-h-screen bg-black text-white font-sans selection:bg-yellow-500/30 flex flex-col">
        
        {/* GLOBAL NAVIGATION */}
        <nav className="border-b border-gray-900 bg-black/80 backdrop-blur sticky top-0 z-50 shrink-0">
          <div className="max-w-full mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => user.isLoggedIn ? setPage('DASHBOARD') : setPage('LOGIN')}>
              <div className="w-9 h-9 bg-yellow-500 rounded-lg flex items-center justify-center shadow-lg shadow-yellow-500/20">
                <Brain className="w-5 h-5 text-black" />
              </div>
              <span className="font-bold text-lg tracking-tight">SENSEI-AI</span>
            </div>
            
            <div className="flex items-center space-x-6">
              {user.isLoggedIn && (
                <>
                  <button onClick={() => setPage('DASHBOARD')} className={`text-sm font-medium transition-colors ${page === 'DASHBOARD' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>Dashboard</button>
                  <button onClick={() => setPage('EXAM')} className={`text-sm font-medium transition-colors ${page === 'EXAM' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>Exams</button>
                  <button onClick={() => setPage('REPO_EXPLAINER')} className={`text-sm font-medium transition-colors ${page === 'REPO_EXPLAINER' ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}>Code Explainer</button>
                  <button onClick={() => setPage('CAREER')} className={`text-sm font-medium transition-colors ${page === 'CAREER' ? 'text-emerald-400' : 'text-gray-400 hover:text-white'}`}>Career</button>
                  <button onClick={() => setPage('READINESS')} className={`text-sm font-medium transition-colors ${page === 'READINESS' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>Job Readiness</button>
                  <button onClick={() => setPage('RESOURCES')} className={`text-sm font-medium transition-colors ${page === 'RESOURCES' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>Resources</button>
                  <button onClick={() => setPage('VOICE_CODING')} className={`text-sm font-medium transition-colors ${page === 'VOICE_CODING' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>Coding</button>
                  <div className="h-4 w-px bg-gray-800" />
                </>
              )}
              
              <button onClick={() => setPage('ABOUT')} className="text-sm font-medium text-gray-400 hover:text-white">About</button>
              
              {user.isLoggedIn ? (
                 <div className="flex items-center space-x-3 pl-2">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                        <User className="w-4 h-4 text-gray-400" />
                    </div>
                    <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">Logout</button>
                 </div>
              ) : (
                 <button onClick={() => setPage('LOGIN')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg text-xs transition-all">
                    Login
                 </button>
              )}
            </div>
          </div>
        </nav>

        {/* MAIN LAYOUT WITH SIDEBAR */}
        <div className="flex flex-1 max-w-full overflow-hidden">
          
          {/* SIDEBAR (Only when logged in AND not in Exam/Repo/Video/Career Mode which have their own context) */}
          {user.isLoggedIn && page !== 'EXAM' && page !== 'REPO_EXPLAINER' && page !== 'CAREER' && page !== 'READINESS' && (
            <aside className="w-72 bg-gray-900/30 border-r border-gray-900 hidden md:flex flex-col p-4 shrink-0 overflow-y-auto">
              <div className="mb-6">
                 <button 
                   onClick={() => setPage('GOAL_INTAKE')} 
                   className="w-full py-3 bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-500 border border-yellow-600/30 rounded-lg flex items-center justify-center space-x-2 font-bold transition-all hover:scale-105"
                 >
                    <Plus className="w-4 h-4" />
                    <span>New Learning Path</span>
                 </button>
              </div>

              <div className="space-y-2">
                 <div className="px-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">My Paths</div>
                 {learningPaths.map((path, idx) => (
                    <button 
                      key={idx}
                      onClick={() => switchTopic(path)}
                      className={`w-full text-left p-3 rounded-lg flex items-center space-x-3 transition-colors ${
                         progress.topic === path.topic ? 'bg-gray-800 text-white border border-gray-700' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                      }`}
                    >
                       <div className={`w-2 h-2 rounded-full ${path.percentage === 100 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                       <div className="flex-1 truncate">
                          <div className="font-bold truncate">{path.topic}</div>
                          <div className="text-xs text-gray-500 truncate">{path.subtopic}</div>
                       </div>
                    </button>
                 ))}
                 {learningPaths.length === 0 && (
                     <div className="text-center py-8 text-gray-600 text-sm">
                         No paths yet.
                     </div>
                 )}
              </div>
            </aside>
          )}

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-hidden relative flex flex-col bg-black">
              {page === 'LOGIN' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800/20 via-black to-black">
                      <div className="max-w-md w-full space-y-8 text-center">
                          <div className="w-20 h-20 bg-yellow-500 rounded-2xl mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                              <Brain className="w-10 h-10 text-black" />
                          </div>
                          <h1 className="text-4xl font-bold text-white tracking-tight">Sensei AI</h1>
                          <p className="text-gray-400 text-lg">The autonomous learning companion for audio-first learning.</p>
                          
                          <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl space-y-4">
                              <input 
                                  type="text" 
                                  placeholder="Enter your name"
                                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin((e.target as HTMLInputElement).value) }}
                              />
                              <button 
                                  onClick={(e) => {
                                       const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                                       if (input?.value) handleLogin(input.value);
                                  }}
                                  className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 rounded-lg transition-all transform hover:scale-[1.02]"
                              >
                                  Start Learning
                              </button>
                          </div>
                      </div>
                  </div>
              )}

              {page === 'DASHBOARD' && (
                  <div className="flex-1 p-8 overflow-y-auto">
                      <div className="max-w-5xl mx-auto space-y-8">
                          <div className="flex items-end justify-between border-b border-gray-800 pb-6">
                              <div>
                                  <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {user.name}</h1>
                                  <p className="text-gray-400">Current Focus: <span className="text-yellow-500 font-bold">{progress.topic || 'None'}</span></p>
                              </div>
                              {progress.topic && (
                                  <div className="flex items-center space-x-4">
                                      <button onClick={() => { setActiveExamSession(null); setActiveRepoSession(null); setPage('TEACHER'); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg flex items-center space-x-2 transition-all">
                                          <BookOpen className="w-4 h-4" />
                                          <span>Continue Lesson</span>
                                      </button>
                                      <button onClick={() => setPage('ASSESSMENT')} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg flex items-center space-x-2 transition-all border border-gray-700">
                                          <CheckCircle className="w-4 h-4" />
                                          <span>Take Exam</span>
                                      </button>
                                  </div>
                              )}
                          </div>

                          {/* Syllabus / Progress View */}
                          {syllabus ? (
                              <div className="grid gap-6">
                                  <div className="flex items-center justify-between">
                                      <h2 className="text-xl font-bold text-white">Learning Path</h2>
                                  </div>
                                  <div className="space-y-4">
                                      {syllabus.lessons.map((lesson: any, i: number) => (
                                          <div key={i} className={`p-6 rounded-xl border transition-all ${lesson.status === 'completed' ? 'bg-green-900/10 border-green-900/30' : lesson.status === 'active' ? 'bg-blue-900/10 border-blue-500/50' : 'bg-gray-900/50 border-gray-800'}`}>
                                              <div className="flex justify-between items-start">
                                                  <div>
                                                      <div className="flex items-center space-x-3 mb-2">
                                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${lesson.status === 'completed' ? 'bg-green-500 text-black' : lesson.status === 'active' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                                              {i + 1}
                                                          </div>
                                                          <h3 className={`text-lg font-bold ${lesson.status === 'active' ? 'text-blue-400' : 'text-white'}`}>{lesson.title}</h3>
                                                      </div>
                                                      <p className="text-gray-400 ml-9">{lesson.description}</p>
                                                  </div>
                                                  {lesson.status === 'active' && (
                                                      <button onClick={() => { setActiveExamSession(null); setActiveRepoSession(null); setPage('TEACHER'); }} className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-bold border border-blue-600/30 hover:bg-blue-600/30">
                                                          Start
                                                      </button>
                                                  )}
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ) : (
                              !progress.topic && (
                                  <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/30">
                                      <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                      <h3 className="text-xl font-bold text-gray-500 mb-2">No Active Learning Path</h3>
                                      <button onClick={() => setPage('GOAL_INTAKE')} className="text-yellow-500 hover:text-yellow-400 font-bold underline">
                                          Create a new path
                                      </button>
                                  </div>
                              )
                          )}
                      </div>
                  </div>
              )}

              {page === 'EXAM' && (
                  <ExamPortal 
                      examData={examData}
                      setExamData={setExamData}
                      completedTopics={examCompletedTopics}
                      onStartExamLesson={handleStartExamLesson}
                  />
              )}

              {page === 'REPO_EXPLAINER' && (
                  <RepoExplainer 
                      onStartExplainer={handleStartRepoSession}
                      onCancel={() => setPage('DASHBOARD')}
                  />
              )}
              
              {page === 'CAREER' && (
                  <CareerCounselor 
                      onBack={() => setPage('DASHBOARD')}
                  />
              )}

              {page === 'READINESS' && (
                  <CompanyReadiness 
                      onBack={() => setPage('DASHBOARD')}
                  />
              )}

              {page === 'TEACHER' && (
                  <div className="flex-1 p-4 md:p-6 overflow-hidden">
                       <LiveSensei 
                          // Logic to construct the active lesson object based on mode
                          lesson={
                              activeExamSession 
                              ? { id: 'exam', title: activeExamSession.topic, description: `Chapter: ${activeExamSession.chapter}`, keyConcepts: [activeExamSession.subject], status: 'active' }
                              : activeRepoSession
                              ? { id: 'repo', title: 'Repo Walkthrough', description: activeRepoSession.repoUrl || 'Local Project', keyConcepts: ['Architecture', 'Flow'], status: 'active' }
                              : (syllabus?.lessons.find((l:any) => l.status === 'active') || { id: '0', title: progress.topic, description: 'Custom', keyConcepts: [], status: 'active' })
                          }
                          progress={progress}
                          examContext={activeExamSession || undefined}
                          repoContext={activeRepoSession || undefined}
                          onProgressUpdate={updateProgress}
                          onComplete={(score) => {
                              alert(`Session Completed`);
                              if (activeExamSession) setPage('EXAM');
                              else if (activeRepoSession) setPage('REPO_EXPLAINER');
                              else setPage('DASHBOARD');
                          }}
                          onExit={() => {
                              if (activeExamSession) setPage('EXAM');
                              else if (activeRepoSession) setPage('REPO_EXPLAINER');
                              else setPage('DASHBOARD');
                          }}
                       />
                  </div>
              )}

              {page === 'VOICE_CODING' && (
                  <div className="flex-1 p-4 md:p-6 overflow-hidden">
                       <VoiceCoder 
                          codeState={codeState}
                          setCodeState={setCodeState}
                          onExit={() => setPage('DASHBOARD')}
                       />
                  </div>
              )}

              {page === 'ASSESSMENT' && (
                  <div className="flex-1 p-4 md:p-6 overflow-hidden">
                      <OralEvaluator 
                          topic={progress.topic}
                          onComplete={(score) => {
                              alert(`Exam Completed. Score: ${score}/100`);
                              setPage('DASHBOARD');
                          }}
                      />
                  </div>
              )}

              {page === 'GOAL_INTAKE' && (
                  <div className="flex-1 p-4 md:p-6 overflow-hidden">
                      <GoalCollector 
                          onGoalCaptured={startNewTopic}
                          onCancel={() => setPage('DASHBOARD')}
                      />
                  </div>
              )}

              {page === 'RESOURCES' && (
                  <div className="flex-1 p-8 overflow-y-auto">
                      <div className="max-w-6xl mx-auto">
                          <h1 className="text-3xl font-bold text-white mb-8 flex items-center space-x-3">
                              <Library className="w-8 h-8 text-yellow-500" />
                              <span>Resource Generator</span>
                          </h1>
                          
                          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl mb-6">
                              <p className="text-gray-400 text-sm">Target: <span className="text-white font-bold">{activeExamSession ? `${activeExamSession.examName} (${activeExamSession.topic})` : activeRepoSession ? "GitHub Repo Explainer" : progress.topic || "None"}</span></p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                               {[
                                   { id: 'NOTES', title: 'Smart Notes', icon: FileText, desc: 'Detailed study notes with examples', color: 'blue' },
                                   { id: 'MIND_MAP', title: 'Mind Map', icon: Network, desc: 'Visual hierarchical concept tree', color: 'purple' },
                                   { id: 'QUIZ', title: 'Quiz Generator', icon: List, desc: 'Practice questions with answers', color: 'green' },
                                   { id: 'SLIDES', title: 'Presentation', icon: Presentation, desc: 'Slide deck outlines for teaching', color: 'orange' },
                                   { id: 'CHEAT_SHEET', title: 'Cheat Sheet', icon: Zap, desc: 'Quick reference guide', color: 'yellow' }
                               ].map((item) => (
                                   <button 
                                      key={item.id}
                                      onClick={() => handleGenerateResource(
                                          item.id as any, 
                                          activeExamSession ? activeExamSession.topic : 
                                          activeRepoSession ? "Repository Architecture & Code Flow" : 
                                          progress.topic
                                      )}
                                      disabled={(!progress.topic && !activeExamSession && !activeRepoSession) || isGenerating}
                                      className={`p-6 rounded-xl border text-left group transition-all hover:-translate-y-1 ${
                                          (!progress.topic && !activeExamSession && !activeRepoSession) ? 'opacity-50 cursor-not-allowed bg-gray-900 border-gray-800' : 
                                          'bg-gray-900/50 hover:bg-gray-900 border-gray-800 hover:border-gray-700'
                                      }`}
                                   >
                                      <div className={`w-12 h-12 rounded-lg bg-${item.color}-900/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                          <item.icon className={`w-6 h-6 text-${item.color}-500`} />
                                      </div>
                                      <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                                      <p className="text-gray-400 text-sm">{item.desc}</p>
                                   </button>
                               ))}
                          </div>

                          {(!progress.topic && !activeExamSession && !activeRepoSession) && (
                              <div className="mt-8 p-4 bg-yellow-900/10 border border-yellow-900/30 rounded-lg flex items-center space-x-3 text-yellow-500">
                                  <AlertCircle className="w-5 h-5" />
                                  <span>Please select a learning path, exam, or repo to generate resources.</span>
                              </div>
                          )}
                      </div>
                  </div>
              )}

              {page === 'ABOUT' && (
                  <div className="flex-1 p-8 overflow-y-auto flex items-center justify-center">
                      <div className="max-w-2xl text-center space-y-6">
                          <Brain className="w-20 h-20 text-yellow-500 mx-auto" />
                          <h1 className="text-4xl font-bold text-white">About Sensei AI</h1>
                          <p className="text-gray-400 text-lg leading-relaxed">
                              Sensei is an experimental autonomous education platform designed for audio-first learning. 
                              It uses Gemini 1.5 Pro's multimodal capabilities to teach, visualize, and code purely through voice interaction.
                          </p>
                          <div className="pt-8 grid grid-cols-2 gap-4 text-left">
                              <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                                  <h3 className="font-bold text-white mb-1">Latency</h3>
                                  <p className="text-sm text-gray-500">Real-time WebSockets</p>
                              </div>
                              <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                                  <h3 className="font-bold text-white mb-1">Model</h3>
                                  <p className="text-sm text-gray-500">Gemini 2.5 Flash</p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}
          </main>
        </div>
      </div>
    </GuardianAgent>
  );
}