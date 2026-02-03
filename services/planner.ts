import { GoogleGenAI, Type } from "@google/genai";
import { Syllabus, Lesson, ExamPlan } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

// Helper to sanitize AI JSON response which might contain markdown fences
const cleanJson = (text: string) => {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const generateSyllabus = async (topic: string): Promise<Syllabus> => {
  const ai = getAI();

  // Retry logic (3 attempts)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const prompt = `
        You are Sensei-Planner, the architect of autonomous learning paths.
        
        USER REQUEST: "${topic}"

        STRICT CURRICULUM RULES:
        1. **SINGLE COURSE POLICY**: Create ONE unified, comprehensive course for "${topic}". 
           - Do NOT split it into separate small courses.
           - Everything must be inside this ONE syllabus.
        
        2. **COMPLETENESS (Zero to Hero)**: 
           - The syllabus MUST cover the subject from absolute beginner basics to advanced concepts.
           - For Programming (e.g., Python), you MUST include:
             * Lesson 1: Fundamentals (Variables, Types, Input/Output)
             * Lesson 2: Control Flow (Conditions, Loops, Logic)
             * Lesson 3: Functions & Modularity
             * Lesson 4: Data Structures (Lists, Dicts, Tuples)
             * Lesson 5: Advanced Concepts (OOP, Error Handling, Files)
             * Lesson 6: Real-world Projects & Modules
        
        3. **HIERARCHY**: The lessons must follow a logical dependency order.
        
        4. **AUDIO-FIRST DESIGN**: Focus key concepts on things that can be explained verbally (logic, concepts, mental models) rather than purely visual syntax.

        Generate a JSON response with a robust list of 5-8 lessons.
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
              topic: { type: Type.STRING, description: "The broad name of the course" },
              lessons: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    keyConcepts: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING } 
                    },
                  },
                  required: ["id", "title", "description", "keyConcepts"]
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(cleanJson(response.text || "{}"));
      if (data.lessons && data.lessons.length > 0) {
        // Add status
        data.lessons = data.lessons.map((l: any, i: number) => ({
             ...l,
             status: i === 0 ? 'active' : 'pending'
        }));
        return data as Syllabus;
      }
    } catch (e) {
      console.error(`Attempt ${attempt + 1} failed:`, e);
      if (attempt === 2) throw e;
    }
  }
  throw new Error("Failed to generate syllabus");
};

export const generateExamPlan = async (examName: string, rawText: string): Promise<ExamPlan> => {
  const ai = getAI();

  const prompt = `
    You are a STRICT EXAM CURRICULUM ARCHITECT.
    
    TASK: Convert the raw syllabus text into a GRANULAR, HIERARCHICAL exam plan for "${examName}".
    
    RAW SYLLABUS TEXT:
    """
    ${rawText.substring(0, 30000)}
    """
    
    CRITICAL RULES (FULL VISIBILITY):
    1. **ATOMIC TOPICS**: Do NOT merge concepts. If a chapter has 10 sub-concepts, list ALL 10 as separate topics.
       - Bad: "Matrices and Determinants" (1 topic)
       - Good: "Matrices Definition", "Types of Matrices", "Matrix Operations", "Determinants", "Minors & Cofactors", "Inverse of Matrix" (6 topics)
    
    2. **HIERARCHY**: Subject -> Chapter -> Topics.
    
    3. **COVERAGE**: Every single keyword in the syllabus that represents a learnable concept MUST be a topic.
    
    4. **NAMING**: Keep topic titles concise (e.g. "Newton's Laws" instead of "Understanding Newton's Laws").
    
    Generate a JSON response matching the Schema.
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
          examName: { type: Type.STRING },
          subjects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                chapters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      topics: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            title: { type: Type.STRING },
                            status: { type: Type.STRING, enum: ['pending', 'completed'] }
                          },
                          required: ["id", "title", "status"]
                        }
                      }
                    },
                    required: ["id", "title", "topics"]
                  }
                }
              },
              required: ["id", "title", "chapters"]
            }
          }
        },
        required: ["examName", "subjects"]
      }
    }
  });

  const data = JSON.parse(cleanJson(response.text || "{}"));
  return data as ExamPlan;
};