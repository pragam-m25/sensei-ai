import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Building2, UserCheck, FileText, AlertTriangle, CheckCircle, Loader2, ArrowRight, Target, Briefcase, TrendingUp, XCircle, Search } from 'lucide-react';

interface CompanyReadinessProps {
  onBack: () => void;
}

interface ApplicationProfile {
  company: string;
  role: string;
  skills: string;
  experience: string;
  projects: string;
  resumeText: string;
}

interface ReadinessAnalysis {
  score: number;
  verdict: string;
  hiringProbability: 'Low' | 'Medium' | 'High' | 'Very High';
  skillMatch: {
    matched: string[];
    missing: string[];
  };
  resumeFeedback: string[];
  projectSuggestions: string[];
  actionPlan: string[];
}

export const CompanyReadiness: React.FC<CompanyReadinessProps> = ({ onBack }) => {
  const [step, setStep] = useState<'INPUT' | 'ANALYZING' | 'RESULTS'>('INPUT');
  const [profile, setProfile] = useState<ApplicationProfile>({
    company: '',
    role: '',
    skills: '',
    experience: 'Junior (0-2 years)',
    projects: '',
    resumeText: ''
  });
  const [analysis, setAnalysis] = useState<ReadinessAnalysis | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setProfile(prev => ({ ...prev, resumeText: event.target?.result as string }));
      }
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!profile.company || !profile.role || !profile.skills) return;
    setStep('ANALYZING');

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });

      // Fallback logic for resume text
      const resumeContext = profile.resumeText && profile.resumeText.length > 20
        ? profile.resumeText.substring(0, 10000) // Allow more context
        : "NO RESUME TEXT PROVIDED. You MUST infer the candidate's likely resume structure based on their 'Reported Skills' and 'Experience' and provide improvements based on standard industry expectations for this role.";

      const prompt = `
        CRITICAL ANALYSIS OVERRIDE — JOB READINESS PAGE

        ROLE: You are a STRICT HIRING MANAGER & TECHNICAL RECRUITER at ${JSON.stringify(profile.company)}.
        
        INPUT DATA:
        - Target Company: ${JSON.stringify(profile.company)}
        - Target Role: ${JSON.stringify(profile.role)}
        - Experience Level: ${JSON.stringify(profile.experience)}
        - Reported Skills: ${JSON.stringify(profile.skills)}
        - Key Projects Summary: ${JSON.stringify(profile.projects)}
        - Resume/Profile Context: ${JSON.stringify(resumeContext)}

        ---------------------------------------------------------
        REAL ANALYSIS MODE (MANDATORY RULES):
        1. **NO EMPTY SECTIONS**: Every section (Action Plan, Resume Improvements, Project Ideas) MUST be populated.
        
        2. **DETERMINISTIC SCORING**:
           - Calculate confidence based on: Skill Match (40%), Project Relevance (30%), Experience Fit (30%).
           - Be CONSISTENT. Do not generate random scores.
           - Be HONEST. If they are not ready, give a low score (<60).

        3. **SKILL GAP ANALYSIS**:
           - 'matched': List skills they have that fit the role.
           - 'missing': List specific tools/frameworks required by ${profile.company} that they didn't mention.

        4. **ACTION PLAN (MANDATORY)**:
           - Provide a 3-5 step concrete plan.
           - Keep steps concise.

        5. **RESUME IMPROVEMENTS (MANDATORY)**:
           - List 3-4 specific bullet points.
           - Keep advice actionable.

        6. **PROJECT IDEAS (MANDATORY)**:
           - Suggest 2 industry-standard projects.
        ---------------------------------------------------------

        OUTPUT JSON SCHEMA (Strictly adhere to this):
        {
          "score": number (0-100),
          "verdict": "string (Concise summary)",
          "hiringProbability": "Low" | "Medium" | "High" | "Very High",
          "skillMatch": {
            "matched": ["string"],
            "missing": ["string"]
          },
          "resumeFeedback": ["string"],
          "projectSuggestions": ["string"],
          "actionPlan": ["string"]
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
              score: { type: Type.NUMBER },
              verdict: { type: Type.STRING },
              hiringProbability: { type: Type.STRING, enum: ['Low', 'Medium', 'High', 'Very High'] },
              skillMatch: {
                type: Type.OBJECT,
                properties: {
                  matched: { type: Type.ARRAY, items: { type: Type.STRING } },
                  missing: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              },
              resumeFeedback: { type: Type.ARRAY, items: { type: Type.STRING } },
              projectSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });

      if (!response.text) throw new Error("No response from AI");
      
      // Sanitize JSON (remove markdown fences if present)
      const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanText);
      
      setAnalysis(result);
      setStep('RESULTS');

    } catch (e) {
      console.error(e);
      alert("Analysis failed. Please check inputs and try again.");
      setStep('INPUT');
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 50) return 'text-red-500 border-red-500';
    if (score < 75) return 'text-yellow-500 border-yellow-500';
    return 'text-green-500 border-green-500';
  };

  if (step === 'INPUT') {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-black flex flex-col items-center">
        <div className="max-w-3xl w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-blue-900/30 border border-blue-500/30 rounded-2xl mx-auto flex items-center justify-center shadow-2xl">
              <Building2 className="w-10 h-10 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-white">Company Readiness Check</h1>
            <p className="text-gray-400">
              Get a brutal, realistic confidence score for your dream role.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6 shadow-xl">
            {/* Target */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        <span>Target Company</span>
                    </label>
                    <input
                        value={profile.company}
                        onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                        placeholder="e.g. Google, Amazon, Startup..."
                        className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                    />
                </div>
                <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                        <Briefcase className="w-4 h-4 text-purple-500" />
                        <span>Target Role</span>
                    </label>
                    <input
                        value={profile.role}
                        onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                        placeholder="e.g. Backend Engineer, Data Scientist..."
                        className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Experience */}
            <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span>Your Experience Level</span>
                </label>
                <select
                    value={profile.experience}
                    onChange={(e) => setProfile({ ...profile, experience: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                >
                    <option>Student / Intern</option>
                    <option>Junior (0-2 years)</option>
                    <option>Mid-Level (2-5 years)</option>
                    <option>Senior (5+ years)</option>
                    <option>Lead / Manager</option>
                </select>
            </div>

            {/* Skills */}
            <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                    <UserCheck className="w-4 h-4 text-yellow-500" />
                    <span>Your Skills (Be Honest)</span>
                </label>
                <textarea
                    value={profile.skills}
                    onChange={(e) => setProfile({ ...profile, skills: e.target.value })}
                    placeholder="e.g. JavaScript, React, Node.js, Python (Basic)..."
                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none min-h-[80px]"
                />
            </div>

            {/* Projects */}
            <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                    <Target className="w-4 h-4 text-red-500" />
                    <span>Key Projects</span>
                </label>
                <textarea
                    value={profile.projects}
                    onChange={(e) => setProfile({ ...profile, projects: e.target.value })}
                    placeholder="Briefly describe 1-2 best projects..."
                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none min-h-[80px]"
                />
            </div>

            {/* Resume */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="flex items-center space-x-2 text-sm font-bold text-gray-300">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span>Resume Content (Optional)</span>
                    </label>
                    <div className="relative">
                        <input 
                            type="file" 
                            accept=".txt,.md"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button className="text-xs text-blue-400 hover:text-blue-300 underline">
                            Upload Text File
                        </button>
                    </div>
                </div>
                <textarea
                    value={profile.resumeText}
                    onChange={(e) => setProfile({ ...profile, resumeText: e.target.value })}
                    placeholder="Paste your resume text here for better analysis..."
                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none min-h-[100px] text-xs font-mono"
                />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!profile.company || !profile.role || !profile.skills}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all ${
                !profile.company || !profile.role
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50 hover:scale-[1.02]'
              }`}
            >
              <span>Calculate Confidence Score</span>
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
          <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Analyzing Candidate Fit...</h2>
          <p className="text-gray-400">Comparing your profile against {profile.company} standards.</p>
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
              <div className="flex items-center space-x-2 text-gray-400 mb-1">
                 <span>{profile.company}</span>
                 <span>•</span>
                 <span>{profile.role}</span>
              </div>
              <h1 className="text-2xl font-bold text-white">Readiness Assessment</h1>
           </div>
           <button 
             onClick={() => setStep('INPUT')}
             className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-bold border border-gray-700 transition-colors"
           >
             Check Another Role
           </button>
        </div>

        {/* Score Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="md:col-span-1 bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
              <div className={`w-40 h-40 rounded-full border-8 flex items-center justify-center mb-6 ${getScoreColor(analysis?.score || 0)}`}>
                 <div>
                    <div className="text-5xl font-bold text-white">{analysis?.score}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest mt-1">Confidence</div>
                 </div>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-sm font-bold border ${
                 analysis?.hiringProbability === 'Low' ? 'bg-red-900/20 text-red-400 border-red-500/30' :
                 analysis?.hiringProbability === 'Medium' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30' :
                 'bg-green-900/20 text-green-400 border-green-500/30'
              }`}>
                 Probability: {analysis?.hiringProbability}
              </div>
              <p className="text-gray-400 mt-6 text-sm italic">"{analysis?.verdict}"</p>
           </div>

           <div className="md:col-span-2 space-y-6">
              {/* Gap Analysis */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                 <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                    <Search className="w-5 h-5 text-purple-500" />
                    <span>Skill Gap Analysis</span>
                 </h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                       <h4 className="text-sm font-bold text-green-400 uppercase tracking-wide mb-3 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-2" /> Matched Skills
                       </h4>
                       <div className="flex flex-wrap gap-2">
                          {analysis?.skillMatch?.matched?.map((skill, i) => (
                             <span key={i} className="px-2 py-1 bg-green-900/20 text-green-300 text-xs rounded border border-green-900/30">
                                {skill}
                             </span>
                          ))}
                          {(!analysis?.skillMatch?.matched || analysis.skillMatch.matched.length === 0) && <span className="text-gray-500 text-sm">No specific matches found.</span>}
                       </div>
                    </div>
                    <div>
                       <h4 className="text-sm font-bold text-red-400 uppercase tracking-wide mb-3 flex items-center">
                          <XCircle className="w-4 h-4 mr-2" /> Missing / Weak
                       </h4>
                       <div className="flex flex-wrap gap-2">
                          {analysis?.skillMatch?.missing?.map((skill, i) => (
                             <span key={i} className="px-2 py-1 bg-red-900/20 text-red-300 text-xs rounded border border-red-900/30">
                                {skill}
                             </span>
                          ))}
                          {(!analysis?.skillMatch?.missing || analysis.skillMatch.missing.length === 0) && <span className="text-gray-500 text-sm">No critical gaps identified.</span>}
                       </div>
                    </div>
                 </div>
              </div>

              {/* Action Plan */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                 <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    <span>Action Plan</span>
                 </h3>
                 {analysis?.actionPlan && analysis.actionPlan.length > 0 ? (
                    <ul className="space-y-3">
                        {analysis.actionPlan.map((step, i) => (
                           <li key={i} className="flex items-start text-sm text-gray-300">
                              <span className="mr-3 text-blue-500 font-bold">{i+1}.</span>
                              {step}
                           </li>
                        ))}
                    </ul>
                 ) : (
                    <p className="text-gray-500 italic">No specific action plan generated.</p>
                 )}
              </div>
           </div>
        </div>

        {/* Detailed Feedback Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Resume Feedback */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-yellow-500" />
                    <span>Resume Improvements</span>
                </h3>
                {analysis?.resumeFeedback && analysis.resumeFeedback.length > 0 ? (
                    <ul className="space-y-3">
                        {analysis.resumeFeedback.map((tip, i) => (
                            <li key={i} className="flex items-start text-sm text-gray-300 bg-gray-950/50 p-3 rounded-lg border border-gray-800">
                                <AlertTriangle className="w-4 h-4 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" />
                                {tip}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 italic">No resume suggestions generated.</p>
                )}
            </div>

            {/* Project Ideas */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                    <Target className="w-5 h-5 text-red-500" />
                    <span>Project Ideas to Impress</span>
                </h3>
                {analysis?.projectSuggestions && analysis.projectSuggestions.length > 0 ? (
                    <div className="space-y-4">
                        {analysis.projectSuggestions.map((idea, i) => (
                            <div key={i} className="p-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700">
                                <p className="text-sm text-white font-medium leading-relaxed">
                                    {idea}
                                </p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 italic">No project suggestions generated.</p>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};