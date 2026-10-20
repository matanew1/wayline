import { useEffect, useState } from 'react';

/** Current time, refreshed every `everyMs` — keeps "arrive 14:32" labels pure and fresh. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
