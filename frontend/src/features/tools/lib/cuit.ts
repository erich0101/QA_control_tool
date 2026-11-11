/** Prefijos de CUIT usados en la práctica (personas físicas y jurídicas). */
export const CUIT_PREFIXES = [20, 24, 27, 30, 34] as const;

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Dígito verificador módulo 11 (algoritmo AFIP).
 * `first10` son los 10 primeros dígitos: prefijo (2) + DNI (8).
 */
export function cuitCheckDigit(first10: string): number {
  if (!/^\d{10}$/.test(first10)) {
    throw new Error('Se esperaban 10 dígitos para calcular el verificador');
  }

  const sum = first10
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * WEIGHTS[index], 0);

  const remainder = 11 - (sum % 11);

  if (remainder === 11) return 0;
  if (remainder === 10) return 9; // Caso borde del módulo 11.
  return remainder;
}

export function generateCuit(prefix?: number, random: () => number = Math.random): string {
  const chosen = prefix ?? CUIT_PREFIXES[Math.floor(random() * CUIT_PREFIXES.length)];

  if (!CUIT_PREFIXES.includes(chosen as (typeof CUIT_PREFIXES)[number])) {
    throw new Error(`Prefijo inválido: ${chosen}`);
  }

  // DNI de 8 dígitos sin ceros a la izquierda (más realista).
  const body = String(Math.floor(random() * 89_999_999) + 10_000_000);
  const first10 = `${chosen}${body}`;

  return `${first10}${cuitCheckDigit(first10)}`;
}

/** Genera N CUITs únicos (sin formato). */
export function generateCuits(
  quantity: number,
  prefix?: number,
  random: () => number = Math.random,
): string[] {
  const max = Math.max(1, Math.min(50_000, Math.floor(quantity)));
  const seen = new Set<string>();
  const out: string[] = [];

  let attempts = 0;
  const maxAttempts = max * 10;

  while (out.length < max && attempts < maxAttempts) {
    const cuit = generateCuit(prefix, random);
    if (!seen.has(cuit)) {
      seen.add(cuit);
      out.push(cuit);
    }
    attempts += 1;
  }

  return out;
}

export function formatCuit(cuit: string): string {
  const digits = cuit.replace(/\D/g, '');
  if (digits.length !== 11) return cuit;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  return cuitCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

export function cuitToCsv(cuits: string[]): string {
  return ['cuit', ...cuits].join('\n');
}
