export const identificationTypeValues = ["SA_ID", "PASSPORT"] as const;
export type IdentificationType = (typeof identificationTypeValues)[number];

export const passportCountryRules = {
  ZA: { label: "South Africa", pattern: /^[A-Z0-9]{8,9}$/ },
  BW: { label: "Botswana", pattern: /^[A-Z]{2}[0-9]{7}$/ },
  LS: { label: "Lesotho", pattern: /^[A-Z]{2}[0-9]{6}$/ },
  NA: { label: "Namibia", pattern: /^[A-Z][0-9]{7}$/ },
  SZ: { label: "Eswatini", pattern: /^[A-Z]{2}[0-9]{6}$/ },
  ZW: { label: "Zimbabwe", pattern: /^[A-Z]{2}[0-9]{6}$/ },
  KE: { label: "Kenya", pattern: /^[A-Z][0-9]{7}$/ },
  NG: { label: "Nigeria", pattern: /^[A-Z][0-9]{8}$/ },
  US: { label: "United States", pattern: /^[0-9]{9}$/ },
  GB: { label: "United Kingdom", pattern: /^[0-9]{9}$/ },
  OTHER: { label: "Other", pattern: /^[A-Z0-9]{6,12}$/ }
} as const;

export const passportCountryValues = Object.keys(passportCountryRules) as Array<
  keyof typeof passportCountryRules
>;
export type PassportCountry = (typeof passportCountryValues)[number];

function luhnCheck(numericValue: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let i = numericValue.length - 1; i >= 0; i -= 1) {
    let digit = Number(numericValue[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidSouthAfricanId(value: string): boolean {
  if (!/^[0-9]{13}$/.test(value)) return false;

  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const validDob =
    validCalendarDate(1900 + yy, month, day) || validCalendarDate(2000 + yy, month, day);
  if (!validDob) return false;

  return luhnCheck(value);
}

export function isValidPassportForCountry(value: string, countryCode: PassportCountry): boolean {
  const normalized = value.trim().toUpperCase();
  const rule = passportCountryRules[countryCode];
  return rule.pattern.test(normalized);
}

