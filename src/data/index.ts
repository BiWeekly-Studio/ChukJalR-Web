import type { Repository } from './repository';
import { mockRepository } from './mockRepository';
import { createSupabaseRepository } from './supabaseRepository';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * 환경변수가 채워져 있으면 Supabase, 아니면 목업.
 * 화면 코드는 어느 쪽인지 알 필요가 없다.
 */
export const repository: Repository =
  url && key ? createSupabaseRepository(url, key) : mockRepository;

export type { Repository } from './repository';
