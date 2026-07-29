export const PRODUCT_CATEGORIES = [
  { key: "newsletter", label: "Newsletter or blog" },
  { key: "culture", label: "Culture (fashion, music, food)" },
  { key: "app", label: "App" },
  { key: "design", label: "Design" },
  { key: "physical", label: "Physical product" },
  { key: "other", label: "Other" },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["key"];

// Shared by /api/analyze-site (how to describe buyers) and generateCampaignSeed (where to
// actually search for them) so the two stay consistent with each other.
export function categoryGuidance(category: string | undefined): string {
  switch (category as ProductCategory) {
    case "newsletter":
      return (
        "This is a newsletter or blog — buyers are individual readers and subscribers, not company job titles. " +
        "Describe personas as consumer archetypes (e.g. 'Busy parent', 'Indie hacker', 'Home cook') with a " +
        "lifestyle or interest descriptor instead of a company type and size. Search consumer-facing spaces: " +
        "relevant subreddits, Facebook groups, niche forums, Discord communities, and X/TikTok/Instagram where " +
        "people actually discuss this newsletter's topic."
      );
    case "culture":
      return (
        "This is a culture/lifestyle product (fashion, music, or food) — buyers are individual consumers, not " +
        "company job titles. Describe personas as consumer archetypes (e.g. 'Streetwear collector', 'Home cook', " +
        "'Vinyl collector') with a lifestyle descriptor instead of a company type and size. Search consumer-facing " +
        "spaces: Instagram, TikTok, relevant subreddits, fan Discords, and niche forums for that specific scene."
      );
    case "app":
      return (
        "This is a software app — buyers are named job titles/roles at real companies, each with a company type " +
        "and size. Search professional/technical spaces: Reddit (r/SaaS and industry-specific subreddits), " +
        "Slack/Discord communities, job postings, Product Hunt, and Indie Hackers."
      );
    case "design":
      return (
        "This is a design product or service — buyers may be individual designers/creators or design-buying " +
        "teams at companies; use whichever framing the actual evidence supports. Search design-specific spaces: " +
        "Dribbble/Behance discussions, r/design and related subreddits, design-focused Discord/Slack communities, " +
        "and design X/Twitter."
      );
    case "physical":
      return (
        "This is a physical product — buyers are individual consumers, not company job titles, unless the " +
        "evidence clearly points to B2B/wholesale. Describe personas as consumer archetypes with a lifestyle " +
        "descriptor instead of a company type and size. Search consumer/maker spaces: Instagram, TikTok, relevant " +
        "subreddits, Etsy/maker forums, and niche product communities."
      );
    default:
      return (
        "Use whichever buyer framing — individual consumer archetype vs. company job title — the evidence on the " +
        "site actually supports, and search whatever public spaces are most likely to have real people discussing " +
        "this specific problem."
      );
  }
}
