/**
 * Server-Side Supabase Storage Client for Showhouse
 * Connects directly to Supabase PostgreSQL using Supabase JS Client / REST
 * Unlimited free operations with 500MB storage
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * Universal document saver to Supabase showhouse_store
 */
export async function saveDocToSupabase(
  collection: string,
  docId: string,
  data: Record<string, any>
): Promise<boolean> {
  if (!collection || !docId || !data) return false;
  try {
    const supabase = getSupabase();
    const cleanColl = String(collection).trim().toLowerCase();
    const cleanId = String(docId).trim().toLowerCase();

    const { error } = await supabase
      .from('showhouse_store')
      .upsert(
        {
          collection: cleanColl,
          doc_id: cleanId,
          data: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'collection,doc_id' }
      );

    if (error) {
      console.warn(`[Supabase] saveDoc error (${cleanColl}/${cleanId}):`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Supabase] saveDoc exception:`, err?.message || err);
    return false;
  }
}

/**
 * Universal document fetcher from Supabase showhouse_store
 */
export async function fetchDocFromSupabase(
  collection: string,
  docId: string
): Promise<Record<string, any> | null> {
  if (!collection || !docId) return null;
  try {
    const supabase = getSupabase();
    const cleanColl = String(collection).trim().toLowerCase();
    const cleanId = String(docId).trim().toLowerCase();

    const { data, error } = await supabase
      .from('showhouse_store')
      .select('data')
      .eq('collection', cleanColl)
      .eq('doc_id', cleanId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data.data as Record<string, any>;
  } catch (err: any) {
    console.warn(`[Supabase] fetchDoc exception:`, err?.message || err);
    return null;
  }
}

/**
 * Universal collection fetcher from Supabase showhouse_store
 */
export async function fetchCollectionDocsFromSupabase(
  collection: string
): Promise<Record<string, any>[]> {
  if (!collection) return [];
  try {
    const supabase = getSupabase();
    const cleanColl = String(collection).trim().toLowerCase();

    const { data, error } = await supabase
      .from('showhouse_store')
      .select('data')
      .eq('collection', cleanColl);

    if (error || !Array.isArray(data)) {
      return [];
    }
    return data.map((row: any) => row.data).filter(Boolean);
  } catch (err: any) {
    console.warn(`[Supabase] fetchCollection exception:`, err?.message || err);
    return [];
  }
}

/**
 * Universal document deleter from Supabase showhouse_store
 */
export async function deleteDocFromSupabase(
  collection: string,
  docId: string
): Promise<boolean> {
  if (!collection || !docId) return false;
  try {
    const supabase = getSupabase();
    const cleanColl = String(collection).trim().toLowerCase();
    const cleanId = String(docId).trim().toLowerCase();

    const { error } = await supabase
      .from('showhouse_store')
      .delete()
      .eq('collection', cleanColl)
      .eq('doc_id', cleanId);

    if (error) {
      console.warn(`[Supabase] deleteDoc error (${cleanColl}/${cleanId}):`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Supabase] deleteDoc exception:`, err?.message || err);
    return false;
  }
}
