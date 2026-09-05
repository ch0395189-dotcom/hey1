import { supabase } from '@/integrations/supabase/client';

const PAGE = 1000;

/**
 * Trae TODAS las filas de una tabla evitando el límite de 1000 filas
 * que aplica la API por defecto (paginando con .range()).
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  table: string,
  columns: string,
  orderColumn = 'created_at'
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    if (all.length > 50000) break;
  }
  return all;
}
