import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Briefcase, Target, Clock, Code, TrendingUp, AlertTriangle, CheckCircle, Loader2, ArrowRight, Compass, GraduationCap, User } from 'lucide-react';

interface CareerCounselorProps {
  onBack: () => void;
}

interface UserProfile {
  currentSkills: string;
  learningNow: string;
  futureInterests: string;
  availability: string;
}

interface CareerAdvice {
  summary: string;
  realityCheck: string;
  roles: Array<{
    title: string;
    match: number;
    reason: string;
    missingSkills: string[];
  }>;
  roadmap: Array<{
    step: string;
    description: string;
    duration: string;
  }>;
}

export const CareerCounselor: React.FC<CareerCounselorProps> = ({ onBack }) => {
  const [step, setStep] = useState<'INTAKE' | 'ANALYZING' | 'RESULTS'>('INTAKE');
  const [profile, setProfile] = useState<UserProfile>({
    currentSkills: '',
    learningNow: '',
    futureInterests: '',
    availability: 'Student (Full Time)'
  });
  const [advice, setAdvice] = useState<CareerAdvice | null>(null);

  const handleAnalyze = async () => {
    if (!profile.currentSkills.trim()) return;
    setStep('ANALYZING');

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        ROLE: Expert Career Strategist & Tech Industry Mentor.
        TASK: Analyze the user's skills and provide a BRUTALLY HONEST career roadmap.

        INPUT PROFILE:
        - Current Skills: ${JSON.stringify(profile.currentSkills)}
        - Learning: ${JSON.stringify(profile.learningNow)}
        - Interests: ${JSON.stringify(profile.futureInterests)}
        - Status: ${JSON.stringify(profile.availability)}

        CRITICAL OUTPUT RULES:
        1. **NO EMPTY ARRAYS**: You MUST suggest at least 2 roles and 3 roadmap steps.
        2. **REALITY CHECK**: Be honest. If they only know HTML/CSS, do not suggest "Senior Architect". Suggest "Junior Frontend".
        3. **SPECIFICITY**: In the roadmap, name specific technologies to learn (e.g. "Learn Redux Toolkit", not just "Learn State Management").

        OUTPUT JSON SCHEMA:
        {
          "summary": "High-level career strategy summary (max 15 words)",
          "realityCheck": "Honest assessment of their employability right now (max 2 sentences)",
          "roles": [
            {
              "title": "Specific Job Title",
              "match": number (0-100),
              "reason": "Why this fits (max 10 words)",
              "missingSkills": ["Critical Skill 1", "Critical Skill 2"]
            }
          ],
          "roadmap": [
            {
              "step": "Phase Name",
              "description": "What to do exactly",
              "duration": "e.g. 2 Weeks"
            }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          maxOutputTokens: 8192, 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              realityCheck: { type: Type.STRING },
              roles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    match: { type: Type.NUMBER },
                    reason: { type: Type.STRING },
                    missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              },
              roadmap: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    description: { type: Type.STRING },
                    duration: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      if (!response.text) throw new Error("No response from AI");
      
      // Sanitize JSON
      const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanText);
      
      setAdvice(result);
      setStep('RESULTS');

    } catch (e) {
      console.error(e);
      alert("Failed to analyze profile. Please try again.");
      setStep('INTAKE');
    }
  };

  if (step === 'INTAKE') {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-black flex flex-col items-center">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-900/30 border border-emerald-500/30 rounded-2xl mx-auto flex items-center justify-center shadow-2xl">
              <Compass className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold text-white">Career Guidance Bureau</h1>
            <p className="text-gray-400">
              No sugar-coating. Just practical roadmap planning based on your actual skills.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6 shadow-xl">
            {/* Skills */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                <Code className="w-4 h-4 text-blue-500" />
                <span>Current Tech Stack</span>
              </label>
              <textarea
                value={profile.currentSkills}
                onChange={(e) => setProfile({ ...profile, currentSkills: e.target.value })}
                placeholder="e.g. Python (Basic), HTML, CSS, React (Learning), Java (School level)..."
                className="w-full bg-black border border-gray-700 rounded-lg p-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none min-h-[100px]"
              />
            </div>

            {/* Learning */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                  <GraduationCap className="w-4 h-4 text-purple-500" />
                  <span>Learning Right Now</span>
                </label>
                <input
                  value={profile.learningNow}
                  onChange={(e) => setProfile({ ...profile, learningNow: e.target.value })}
                  placeholder="e.g. Data Structures, Next.js..."
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                  <Target className="w-4 h-4 text-red-500" />
                  <span>Future Interests</span>
                </label>
                <input
                  value={profile.futureInterests}
                  onChange={(e) => setProfile({ ...profile, futureInterests: e.target.value })}
                  placeholder="e.g. AI, DevOps, Blockchain..."
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                <Clock className="w-4 h-4 text-orange-500" />
                <span>Current Status</span>
              </label>
              <select
                value={profile.availability}
                onChange={(e) => setProfile({ ...profile, availability: e.target.value })}
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
              >
                <option>Student (Full Time)</option>
                <option>Student (Part Time / Working)</option>
                <option>Working Professional (Looking to Switch)</option>
                <option>Drop Year / Gap Year</option>
                <option>Freelancer</option>
              </select>
            </div>

            {/* Action */}
            <button
              onClick={handleAnalyze}
              disabled={!profile.currentSkills}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all ${
                !profile.currentSkills
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 hover:scale-[1.02]'
              }`}
            >
              <span>Analyze Career Path</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'ANALYZING') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black p-8 text-center space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse"></div>
          <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Consulting Industry Data...</h2>
          <p className="text-gray-400">Analyzing your skills against current market requirements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-black p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-6">
           <div>
              <h1 className="text-2xl font-bold text-white mb-1">Career Analysis Report</h1>
              <p className="text-gray-400 text-sm">Personalized guidance based on your profile.</p>
           </div>
           <button 
             onClick={() => setStep('INTAKE')}
             className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-bold border border-gray-700 transition-colors"
           >
             New Analysis
           </button>
        </div>

        {/* Reality Check */}
        <div className="bg-yellow-900/10 border border-yellow-600/30 rounded-xl p-6 flex items-start space-x-4">
           <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
           <div>
              <h3 className="text-lg font-bold text-yellow-500 mb-2">Reality Check</h3>
              <p className="text-gray-300 leading-relaxed">{advice?.realityCheck}</p>
           </div>
        </div>

        {/* Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Left: Recommended Roles */}
           <div className="lg:col-span-2 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                 <Briefcase className="w-5 h-5 text-blue-500" />
                 <span>Suggested Roles</span>
              </h3>
              
              <div className="space-y-4">
                 {advice?.roles?.map((role, idx) => (
                    <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all">
                       <div className="flex justify-between items-start mb-4">
                          <div>
                             <h4 className="text-xl font-bold text-white">{role.title}</h4>
                             <p className="text-sm text-gray-400 mt-1">{role.reason}</p>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                             role.match > 70 ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 
                             role.match > 40 ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30' :
                             'bg-red-900/30 text-red-400 border border-red-500/30'
                          }`}>
                             {role.match}% Match
                          </div>
                       </div>
                       
                       {role.missingSkills && role.missingSkills.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-800">
                             <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Missing Critical Skills</div>
                             <div className="flex flex-wrap gap-2">
                                {role.missingSkills.map((skill, sIdx) => (
                                   <span key={sIdx} className="px-2 py-1 bg-red-900/10 text-red-300 text-xs rounded border border-red-900/30">
                                      {skill}
                                   </span>
                                ))}
                             </div>
                          </div>
                       )}
                    </div>
                 ))}
              </div>
           </div>

           {/* Right: Roadmap */}
           <div className="lg:col-span-1 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                 <TrendingUp className="w-5 h-5 text-emerald-500" />
                 <span>Action Plan</span>
              </h3>
              
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 relative overflow-hidden">
                 <div className="absolute top-0 bottom-0 left-8 w-px bg-gray-800"></div>
                 <div className="space-y-8 relative z-10">
                    {advice?.roadmap?.map((step, idx) => (
                       <div key={idx} className="flex space-x-4">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900 border border-emerald-500/50 flex items-center justify-center text-xs font-bold text-emerald-500 mt-1">
                             {idx + 1}
                          </div>
                          <div>
                             <h5 className="text-sm font-bold text-white">{step.step}</h5>
                             <div className="text-xs font-bold text-emerald-500 mb-1">{step.duration}</div>
                             <p className="text-sm text-gray-400">{step.description}</p>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
};