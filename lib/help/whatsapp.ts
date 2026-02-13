export function buildWhatsAppUrl(number: string, message: string): string {
  const cleanNumber = number.replace(/\D/g, "");
  // Why: this project uses wa.me deep links only; no automatic WhatsApp message dispatch is attempted.
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
