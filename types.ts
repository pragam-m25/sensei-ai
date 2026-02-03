export interface Lesson {
  id: string;
  title: string;
  description: string;
  keyConcepts: string[];
  status: 'pending' | 'active' | 'completed' | 'needs_review';
  masteryScore?: number;
}

export interface Syllabus {
  topic: string;
  lessons: Lesson[];
}

export interface ExamTopic {
  id: string;
  title: string;
  status: 'pending' | 'completed';
}

export interface ExamChapter {
  id: string;
  title: string;
  topics: ExamTopic[];
}

export interface ExamSubject {
  id: string;
  title: string;
  chapters: ExamChapter[];
}

export interface ExamPlan {
  examName: string;
  subjects: ExamSubject[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  SYLLABUS_VIEW = 'SYLLABUS_VIEW',
  TEACHING = 'TEACHING',
  EVALUATING = 'EVALUATING', // Post-session report
}