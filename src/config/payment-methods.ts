import { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHODS = [
  { code: PaymentMethod.CASH, label: "Cash", icon: "💵" },
  { code: PaymentMethod.AIRTEL_MONEY, label: "Airtel Money", icon: "📱" },
  { code: PaymentMethod.MPESA, label: "M-Pesa", icon: "📱" },
  { code: PaymentMethod.ORANGE_MONEY, label: "Orange Money", icon: "📱" },
  { code: PaymentMethod.MTN_MOMO, label: "MTN MoMo", icon: "📱" },
  { code: PaymentMethod.BIZAPAY, label: "Bizapay", icon: "💳" },
  { code: PaymentMethod.BANK_TRANSFER, label: "Bank Transfer", icon: "🏦" },
];

export function getPaymentMethod(code: string | PaymentMethod) {
  const method = PAYMENT_METHODS.find((m) => m.code === code);
  if (method) return method;
  return { code, label: "Autre", icon: "❓" };
}
