/** @param {string} text */
export function hasPayDisclosure(text) {
  const normalized = text.normalize('NFKC');
  return /(?:[₩$€£¥]|\b(?:KRW|USD|EUR|THB|IDR|PHP|JPY|CNY)\s*[\d,]|[\d,.]+\s*(?:만원|만\s*원|천\s*원|원|달러|엔|円|บาท|rupiah|pesos?|dollars?|KRW|USD|EUR|THB|IDR|PHP|JPY|CNY)|(?:페이|급여|보수|출연료|레슨비|지급액|pay\b|salary\b|compensation\b|fee\b).{0,24}\d)/i.test(normalized);
}
/** @param {string} text */
export function stripPayDisclosure(text) {
  return text.split(/\r?\n/).filter(line => !hasPayDisclosure(line)).join('\n').trim();
}
