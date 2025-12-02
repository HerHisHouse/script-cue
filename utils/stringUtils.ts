export function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  
  const str1 = s1.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const str2 = s2.toLowerCase().replace(/[^\w\s]/g, '').trim();

  if (str1 === str2) return 1;

  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  const intersection = words1.filter(w => words2.includes(w));
  return intersection.length / Math.max(words1.length, words2.length);
}
