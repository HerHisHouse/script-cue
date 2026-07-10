import { calculateSimilarity } from './utils/stringUtils';

const text1 = "[Gritando] ¡Quédate parada! De verdad. ¡No te soporto! cállate!";
const text2 = "gritando, quédate parada, de verdad, no te soporto, cállate.";

console.log(calculateSimilarity(text1, text2));
