import { randomUUID } from "node:crypto";

const buyerJourneyDefaults = {
  catalogue: {
    slug: "premium-corporate-essentials",
    name: "Premium corporate essentials",
  },
  product: {
    name: "Atlas cabin trolley",
    quantity: 20,
  },
  buyer: {
    namePrefix: "Playwright E2E Buyer",
    phoneNumber: "9876543210",
  },
  admin: {
    email: "admin@catalogue.test",
    password: "Admin#2026",
  },
};

export function createBuyerJourneyData() {
  return {
    ...buyerJourneyDefaults,
    buyer: {
      ...buyerJourneyDefaults.buyer,
      name: `${buyerJourneyDefaults.buyer.namePrefix} ${randomUUID()}`,
    },
  };
}