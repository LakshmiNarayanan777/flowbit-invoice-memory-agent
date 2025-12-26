import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || process.env.OFFLINE_MODE === 'true') {
      // Provide a lightweight in-memory stub that implements the minimal
      // subset of Supabase client calls used by the demo so it can run
      // offline for testing and demos.
      class InMemoryClient {
        private tables: Record<string, any[]> = {};

        from(table: string) {
          const self = this;

          const ensure = () => {
            if (!self.tables[table]) self.tables[table] = [];
            return self.tables[table];
          };

          return {
            insert: async (row: any) => {
              const t = ensure();
              t.push(row);
              return { data: [row], error: null };
            },
            update: (upd: any) => ({
              eq: async (col: string, val: any) => {
                const t = ensure();
                const updated: any[] = [];
                for (const r of t) {
                  if ((r as any)[col] === val) {
                    Object.assign(r, upd);
                    updated.push(r);
                  }
                }
                return { data: updated, error: null };
              }
            }),
            delete: () => ({
              neq: async (col: string, val: any) => {
                const t = ensure();
                const keep = t.filter(r => (r as any)[col] === val);
                self.tables[table] = keep;
                return { data: [], error: null };
              }
            }),
            select: (cols?: string) => {
              const t = ensure();

              class QueryChain {
                private rows: any[];
                constructor(rows: any[]) {
                  this.rows = rows;
                }

                eq(col: string, val: any) {
                  this.rows = this.rows.filter(r => (r as any)[col] === val);
                  return this;
                }

                neq(col: string, val: any) {
                  this.rows = this.rows.filter(r => (r as any)[col] !== val);
                  return this;
                }

                gte(col: string, val: any) {
                  this.rows = this.rows.filter(r => (r as any)[col] >= val);
                  return this;
                }

                or(_cond: string) {
                  // Very small parser for patterns like "vendor.eq.X,vendor.is.null"
                  try {
                    const parts = _cond.split(',');
                    const results = new Set<any>();
                    for (const p of parts) {
                      const [left, op, right] = p.split('.');
                      if (op === 'eq') {
                        for (const r of t) if ((r as any)[left] === right) results.add(r);
                      } else if (op === 'is' && right === 'null') {
                        for (const r of t) if ((r as any)[left] == null) results.add(r);
                      }
                    }
                    this.rows = Array.from(results);
                  } catch (e) {
                    // fallback: keep all
                    this.rows = t.slice();
                  }
                  return this;
                }

                limit(n: number) {
                  this.rows = this.rows.slice(0, n);
                  return this;
                }

                order(field: string, _opts: any) {
                  this.rows = [...this.rows].sort((a, b) => ((a[field] > b[field]) ? 1 : -1));
                  return this;
                }

                maybeSingle = async () => ({ data: this.rows[0] || null });

                single = async () => ({ data: this.rows[0] || null });

                then(resolve: any) {
                  return Promise.resolve({ data: this.rows }).then(resolve);
                }
              }

              return new QueryChain(t.slice());
            }
          };
        }
      }

      supabase = (new InMemoryClient()) as unknown as SupabaseClient;
      return supabase;
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  return supabase;
}

export async function addAuditEntry(
  invoiceId: string,
  step: 'recall' | 'apply' | 'decide' | 'learn',
  operation: string,
  details: any
): Promise<void> {
  const client = getSupabaseClient();

  await client.from('audit_trail').insert({
    invoice_id: invoiceId,
    step,
    operation,
    details
  });
}
