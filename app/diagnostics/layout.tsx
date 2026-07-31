import type { Metadata } from "next";

// Operator page: linked from nowhere and kept out of search results. It exposes infrastructure
// state rather than customer data, but there is no reason for it to be indexed.
export const metadata: Metadata = {
  title: "Kylani diagnostics",
  robots: { index: false, follow: false },
};

export default function DiagnosticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
