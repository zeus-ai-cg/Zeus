import { Link } from "@tanstack/react-router";
import { Code2, Twitter, Github, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth-session";
import type { ReactNode } from "react";

const FOOTER_LINKS: { label: string; to: string }[] = [
  { label: "Home", to: "/" },
  { label: "Download", to: "/download" },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact", to: "/contact" },
  { label: "About Us", to: "/about" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Refund Policy", to: "/refund" },
  { label: "FAQ", to: "/faq" },
  { label: "Blog", to: "/blog" },
];

export function MarketingHeader() {
  const { isAuthenticated } = useAuthSession();

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
            <Code2 className="size-4 text-primary-foreground" />
          </div>
          <span>
            ⚡ <span className="text-gradient">Zeus AI</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="px-3 py-2 text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link to="/download" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Download
              </Link>
              <Link to="/pricing" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
              <Link to="/profile" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Profile
              </Link>
            </>
          ) : (
            <>
              <Link to="/download" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Download
              </Link>
              <Link to="/pricing" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
              <Link to="/about" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                About
              </Link>
              <Link to="/faq" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                FAQ
              </Link>
              <Link to="/contact" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Contact
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
                asChild
              >
                <Link to="/pricing">Pricing</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
                asChild
              >
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-6xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
              <Code2 className="size-4 text-primary-foreground" />
            </div>
            <span>
              ⚡ <span className="text-gradient">Zeus AI</span>
            </span>
          </Link>
          <p className="mt-1 text-sm font-medium text-primary">💻 AI Software Engineer</p>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            ⚡ Upload. ⚡ Analyze. ⚡ Ship. Your AI Software Engineering Workspace — available 24/7.
          </p>
          <div className="mt-4 flex gap-3 text-muted-foreground">
            <a href="https://twitter.com" aria-label="Twitter" className="hover:text-foreground">
              <Twitter className="size-4" />
            </a>
            <a href="https://github.com" aria-label="GitHub" className="hover:text-foreground">
              <Github className="size-4" />
            </a>
            <a href="https://linkedin.com" aria-label="LinkedIn" className="hover:text-foreground">
              <Linkedin className="size-4" />
            </a>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
            </li>
            <li>
              <Link to="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
            </li>
            <li>
              <Link to="/faq" className="hover:text-foreground">
                FAQ
              </Link>
            </li>
            <li>
              <Link to="/blog" className="hover:text-foreground">
                Blog
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Company & Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/about" className="hover:text-foreground">
                About Us
              </Link>
            </li>
            <li>
              <Link to="/contact" className="hover:text-foreground">
                Contact
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link to="/refund" className="hover:text-foreground">
                Refund Policy
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap gap-3 items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Zeus AI. All rights reserved.</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.label} to={l.to} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="max-w-4xl mx-auto px-6 py-20 text-center relative">
        {eyebrow && (
          <div className="inline-block text-xs uppercase tracking-widest text-accent mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
        )}
      </div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 prose prose-invert prose-headings:tracking-tight prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h3:text-lg prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
      {children}
    </div>
  );
}
