// P8.5-23 (docs/release/03-INJECTION.md): a value spliced into a PostgREST filter
// STRING (`.or(`a.eq.${x},b.eq.${x}`)`) isn't escaped by the query builder the
// way `.eq('a', x)` is, so a crafted value could reshape the filter: the friend
// lookup took `targetId` straight from the /u/[id] link. The rule is one line:
// nothing goes into a filter string unless it passed through uuid() first, and
// scripts/verify-no-string-queries.ts fails the build if anything else does.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** The value itself if it's a UUID; otherwise throws, so a bad id never reaches a query. */
export function uuid(v: unknown): string {
  if (!isUuid(v)) throw new Error('Not a valid id')
  return v
}
