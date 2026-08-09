# kylanithree

Kylani is a [Next.js](https://nextjs.org) app for surfacing revenue-generating
opportunities from a site's audience — onboarding, lead discovery, campaign
generation, and a dashboard for reviewing findings.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project layout

- `app/` — Next.js App Router routes, including `app/api/**` for backend routes
  and `app/app/**` for the authenticated dashboard.
- `components/` — shared UI, split into `landing/`, `onboarding/`, and `dashboard/`.
- `lib/` — server utilities: MongoDB access, auth helpers, Stripe, Gmail,
  Anthropic client, and seed/campaign data generation.
- `public/gallery/` — marketing gallery images.
- `auth.ts` — NextAuth configuration.
- `proxy.ts` — request proxy configuration.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
