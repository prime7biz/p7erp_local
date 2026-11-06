/**
 * Social proof shown on the public landing page.
 *
 * Only add a customer logo or testimonial after the customer has given written permission.
 * Invented quotes or logos are misleading advertising, so these lists stay empty until real entries exist.
 * When a list is empty the landing page hides that block (logos fall back to the industry segments below).
 */

export type CustomerLogo = {
  name: string;
  /** Path under `frontend/public`, e.g. `/images/customers/acme.svg`. */
  src: string;
};

export type Testimonial = {
  quote: string;
  /** Person's name, or leave empty if the customer only approved a role + company line. */
  name?: string;
  role: string;
  company: string;
};

export const customerLogos: readonly CustomerLogo[] = [];

export const testimonials: readonly Testimonial[] = [];

/** Business types Prime7 ERP is built for. Used in the trust strip while no customer logos are approved. */
export const industrySegments: readonly string[] = [
  "Knit garments",
  "Woven garments",
  "Denim",
  "Sweaters",
  "Lingerie & intimates",
  "Buying houses",
  "Sourcing offices",
  "Export LC & commercial teams",
  "Washing & dyeing units",
  "Accessories & trims",
];
