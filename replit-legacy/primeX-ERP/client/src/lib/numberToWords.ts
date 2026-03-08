const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertChunk(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertChunk(n % 100) : '');
}

export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero Taka Only';

  const isNegative = amount < 0;
  amount = Math.abs(amount);

  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);

  let result = '';

  if (intPart === 0) {
    result = 'Zero';
  } else {
    const crore = Math.floor(intPart / 10000000);
    const lakh = Math.floor((intPart % 10000000) / 100000);
    const thousand = Math.floor((intPart % 100000) / 1000);
    const remainder = intPart % 1000;

    const parts: string[] = [];
    if (crore > 0) parts.push(convertChunk(crore) + ' Crore');
    if (lakh > 0) parts.push(convertChunk(lakh) + ' Lakh');
    if (thousand > 0) parts.push(convertChunk(thousand) + ' Thousand');
    if (remainder > 0) parts.push(convertChunk(remainder));

    result = parts.join(' ');
  }

  result += ' Taka';

  if (decPart > 0) {
    result += ' and ' + convertChunk(decPart) + ' Paisa';
  }

  result += ' Only';

  if (isNegative) result = 'Minus ' + result;

  return result;
}
