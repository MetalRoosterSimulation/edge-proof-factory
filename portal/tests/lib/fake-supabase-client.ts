/**
 * Minimal fake standing in for the subset of the Supabase query builder
 * lib/data.ts actually uses (select/eq/order/maybeSingle, then a thenable
 * resolving to { data, error }). Not a full mock of supabase-js — just
 * enough surface to exercise the data layer without a network or a real
 * Postgres instance.
 */
export function makeFakeSupabaseClient(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
      let single = false;

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        order(column: string, opts: { ascending: boolean }) {
          const dir = opts.ascending ? 1 : -1;
          rows = [...rows].sort((a, b) => {
            const av = a[column] as string | number;
            const bv = b[column] as string | number;
            if (av === bv) return 0;
            return av > bv ? dir : -dir;
          });
          return builder;
        },
        maybeSingle() {
          single = true;
          return builder;
        },
        then(
          resolve: (result: { data: unknown; error: null }) => void
        ) {
          resolve({ data: single ? rows[0] ?? null : rows, error: null });
        },
      };

      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
