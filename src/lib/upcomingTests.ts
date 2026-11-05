export interface TestCandidate {
  id: string;
  title: string;
  start_time: string;
  event_type: string;
  color: string;
}

export function isTestTitle(title: string) {
  return /toets|proefwerk|test|deadline|(?:^|[^\p{L}])(?:se|po)(?=$|[^\p{L}])/iu.test(title);
}

export function selectUpcomingTests(events: TestCandidate[], now = new Date(), limit = 3) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const seen = new Set<string>();
  return events
    .filter(e => isTestTitle(e.title) || ['toets', 'proefwerk', 'schoolexamen', 'project'].includes(e.event_type))
    .filter(e => Number.isFinite(Date.parse(e.start_time)) && Date.parse(e.start_time) >= dayStart.getTime())
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    .filter(e => {
      const key = `${e.title.trim().toLowerCase()}|${Date.parse(e.start_time)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
}