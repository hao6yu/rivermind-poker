import type { CoachReview } from '../domain/poker/types';
import type { CoachAnalysisInput, VerifiedHandAnalysis } from '../domain/poker/analysis';
import { isCoachReview } from '../domain/poker/coaching';
import { ensureAnonymousSession, supabase } from './supabase';

export interface HandReviewRequest {
  heroCards: string[];
  board: string[];
  street: string;
  potWon: number;
  result: string;
  actionHistory: string[];
  analysisInput: CoachAnalysisInput;
}

export interface CoachResult {
  review: CoachReview;
  analysis: VerifiedHandAnalysis;
}

interface CoachResponse extends CoachResult {
  model: string;
  analysisVersion: number;
}

export async function requestHandReview(hand: HandReviewRequest): Promise<CoachResult> {
  await ensureAnonymousSession();
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke<CoachResponse>('poker-coach', { body: hand });
  if (error) throw error;
  if (!isCoachReview(data?.review)) throw new Error('The coach returned an invalid review.');
  if (data.analysisVersion !== 1) throw new Error('The coach returned an unverified review.');
  if (data.analysis?.version !== 1 || data.analysis.source !== 'deterministic-poker-engine') {
    throw new Error('The coach returned invalid verification facts.');
  }
  return { review: data.review, analysis: data.analysis };
}
