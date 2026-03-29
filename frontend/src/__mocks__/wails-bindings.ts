import { vi } from 'vitest';

export const mockListReferences = vi.fn().mockResolvedValue([
  {
    id: 'ref-001',
    title: 'Simple Face',
    filePath: 'references/face.png',
    exerciseMode: 'line_work',
    difficulty: 'beginner',
    tags: 'face',
  },
  {
    id: 'ref-002',
    title: 'Body Pose',
    filePath: 'references/body.png',
    exerciseMode: 'line_work',
    difficulty: 'intermediate',
    tags: 'body',
  },
]);

export const mockStartSession = vi.fn().mockResolvedValue({
  id: 'session-001',
  exerciseMode: 'line_work',
  referenceImageId: 'ref-001',
});

export const mockGetFeedback = vi.fn().mockResolvedValue({
  overallScore: 75,
  proportionsScore: 80,
  lineQualityScore: 70,
  colorAccuracyScore: null,
  summary: 'Good attempt with room for improvement.',
  details: 'Your line work shows promise.',
  strengths: ['Clean line strokes', 'Good proportions'],
  improvements: ['Work on line confidence', 'Practice curves'],
});

export const mockRequestFeedback = vi.fn().mockResolvedValue({
  overallScore: 75,
  proportionsScore: 80,
  lineQualityScore: 70,
  colorAccuracyScore: null,
  summary: 'Good attempt with room for improvement.',
  details: 'Your line work shows promise.',
  strengths: ['Clean line strokes', 'Good proportions'],
  improvements: ['Work on line confidence', 'Practice curves'],
});

export const mockGetSession = vi.fn().mockResolvedValue({
  id: 'session-001',
  referenceImageId: 'ref-001',
  exerciseMode: 'line_work',
});

export const mockGetReference = vi.fn().mockResolvedValue({
  id: 'ref-001',
  title: 'Simple Face',
  filePath: 'references/face.png',
});

export const mockGetDrawing = vi.fn().mockResolvedValue({
  id: 'drawing-001',
  filePath: 'drawings/drawing-001.png',
});
