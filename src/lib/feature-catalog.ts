// Catalog for the One-Click Feature Generator (Phase 6). Each entry is a
// ready-made, detailed instruction so the user doesn't have to write a
// prompt — clicking a card runs it straight through the same
// proposeProjectModification pipeline built in Phase 3 (propose → diff
// review → apply → download).

export type FeatureCategory =
  "Core" | "Auth & Access" | "Commerce" | "Content" | "Data & API" | "Integrations";

export type FeatureDefinition = {
  id: string;
  label: string;
  category: FeatureCategory;
  description: string;
  instructions: string;
};

export const FEATURE_CATALOG: FeatureDefinition[] = [
  {
    id: "authentication",
    label: "Authentication",
    category: "Auth & Access",
    description: "Sign up, log in, log out, session handling.",
    instructions:
      "Add a complete authentication system: sign up, log in, log out, and session/token handling, following whatever auth approach and libraries this project already uses (or the most idiomatic choice for its framework if none exists yet). Protect any routes that should require a logged-in user.",
  },
  {
    id: "admin-dashboard",
    label: "Admin Dashboard",
    category: "Core",
    description: "A protected admin area with key metrics/tables.",
    instructions:
      "Add an admin dashboard page, accessible only to admin users, showing key metrics and management tables for this project's main data (users, content, or orders — whichever fits what this project already models). Restrict access appropriately.",
  },
  {
    id: "user-profile",
    label: "User Profile",
    category: "Core",
    description: "Editable profile page for the logged-in user.",
    instructions:
      "Add a user profile page where the logged-in user can view and edit their own profile information (name, avatar/photo, and any other relevant fields already present in the data model).",
  },
  {
    id: "dark-mode",
    label: "Dark Mode",
    category: "Core",
    description: "Light/dark theme toggle across the app.",
    instructions:
      "Add a dark mode / light mode toggle that switches the whole app's theme, persists the user's choice, and respects the OS preference by default if no choice has been made yet.",
  },
  {
    id: "notifications",
    label: "Notifications",
    category: "Core",
    description: "In-app notification center.",
    instructions:
      "Add an in-app notification system: a notification bell/icon with a dropdown or panel listing recent notifications, a way to mark them read, and the underlying data model to store them.",
  },
  {
    id: "blog-system",
    label: "Blog System",
    category: "Content",
    description: "Posts list, post detail, and basic CMS.",
    instructions:
      "Add a blog system: a data model for posts (title, body, author, published date), a public posts list page, an individual post detail page, and a basic create/edit interface for authors.",
  },
  {
    id: "payment-integration",
    label: "Payment Integration",
    category: "Commerce",
    description: "Generic checkout/payment flow scaffold.",
    instructions:
      "Add a payment/checkout flow scaffold: a pricing or checkout page and the server-side handler structure needed to process a payment, using whatever payment provider this project already integrates (or clearly-marked placeholders if none exists yet).",
  },
  {
    id: "rest-api",
    label: "REST API",
    category: "Data & API",
    description: "CRUD REST endpoints for the main data model.",
    instructions:
      "Add REST API endpoints (standard CRUD: list, get, create, update, delete) for this project's main data model, following the existing API/routing conventions already used in the project.",
  },
  {
    id: "graphql-api",
    label: "GraphQL API",
    category: "Data & API",
    description: "A GraphQL schema + resolvers layer.",
    instructions:
      "Add a GraphQL API layer: a schema covering this project's main data model and resolvers for querying and mutating it, integrated with the project's existing server setup.",
  },
  {
    id: "file-upload",
    label: "File Upload",
    category: "Core",
    description: "Upload UI + storage-backed handling.",
    instructions:
      "Add file upload support: an upload UI component and the server-side handling to store the uploaded file (using this project's existing storage/backend if one is set up) and associate it with the relevant record.",
  },
  {
    id: "chat-system",
    label: "Chat System",
    category: "Core",
    description: "Real-time or polling-based user chat.",
    instructions:
      "Add a chat system allowing users to send and receive messages in real time (or via polling if realtime infrastructure isn't already present), including a conversation list and a message thread view.",
  },
  {
    id: "search",
    label: "Search",
    category: "Data & API",
    description: "Search bar + backend query for main content.",
    instructions:
      "Add a search feature: a search input in the UI and a backend query that searches across this project's main content/data model, with results displayed to the user.",
  },
  {
    id: "email-verification",
    label: "Email Verification",
    category: "Auth & Access",
    description: "Verify email on signup before full access.",
    instructions:
      "Add email verification to the signup flow: send a verification link/code on signup, a page to confirm it, and gate full access until the user's email is verified.",
  },
  {
    id: "2fa",
    label: "2FA",
    category: "Auth & Access",
    description: "Optional two-factor authentication.",
    instructions:
      "Add optional two-factor authentication: a way for users to enable 2FA (TOTP-based), a setup flow showing a QR code/secret, and a verification step during login when 2FA is enabled.",
  },
  {
    id: "roles-permissions",
    label: "Roles & Permissions",
    category: "Auth & Access",
    description: "Role-based access control.",
    instructions:
      "Add role-based access control: a role field on users (e.g. admin/member, or roles that fit this project's domain), and enforcement of role-based access on the relevant pages/API routes.",
  },
  {
    id: "analytics",
    label: "Analytics",
    category: "Core",
    description: "Basic usage analytics dashboard.",
    instructions:
      "Add a basic analytics dashboard showing key usage metrics for this project (e.g. active users, most-used features, growth over time) based on data already available in the project's data model.",
  },
  {
    id: "ai-chat",
    label: "AI Chat",
    category: "Integrations",
    description: "An AI-powered chat assistant panel.",
    instructions:
      "Add an AI-powered chat assistant to the project: a chat UI and a server endpoint that calls an LLM provider, following whatever AI provider/SDK this project already uses if one is present.",
  },
  {
    id: "markdown-editor",
    label: "Markdown Editor",
    category: "Content",
    description: "Rich markdown editing with live preview.",
    instructions:
      "Add a markdown editor component with a live preview pane, usable anywhere the project currently accepts long-form text content.",
  },
  {
    id: "realtime-notifications",
    label: "Realtime Notifications",
    category: "Core",
    description: "Push notifications to the UI live.",
    instructions:
      "Upgrade notifications (or add them if missing) to be realtime: new notifications should appear in the UI live without a page refresh, using this project's existing realtime infrastructure if present (e.g. Supabase Realtime, websockets).",
  },
  {
    id: "stripe-integration",
    label: "Stripe Integration",
    category: "Integrations",
    description: "Stripe checkout + webhook handling.",
    instructions:
      "Integrate Stripe: add a checkout flow using Stripe Checkout or Elements, and a webhook handler that processes payment confirmation events and updates the relevant records.",
  },
  {
    id: "paddle-integration",
    label: "Paddle Integration",
    category: "Integrations",
    description: "Paddle checkout + webhook handling.",
    instructions:
      "Integrate Paddle: add a checkout flow using Paddle, and a webhook handler that processes subscription/payment events and updates the relevant records. If Paddle is already integrated, extend it rather than duplicating it.",
  },
  {
    id: "lemonsqueezy-integration",
    label: "Lemon Squeezy Integration",
    category: "Integrations",
    description: "Lemon Squeezy checkout + webhook handling.",
    instructions:
      "Integrate Lemon Squeezy: add a checkout flow (hosted checkout URL or the Lemon.js overlay), and a signature-verified webhook handler that processes subscription/order events and updates the relevant records. If Lemon Squeezy is already integrated, extend it rather than duplicating it.",
  },
  {
    id: "supabase-integration",
    label: "Supabase Integration",
    category: "Integrations",
    description: "Wire up Supabase client, auth, and tables.",
    instructions:
      "Integrate Supabase: set up the client, wire up authentication if not already present, and add the table(s)/migration needed for this project's core data, following Supabase best practices (RLS policies included).",
  },
  {
    id: "firebase-integration",
    label: "Firebase Integration",
    category: "Integrations",
    description: "Wire up Firebase client, auth, and Firestore.",
    instructions:
      "Integrate Firebase: set up the client SDK, wire up Firebase Authentication if not already present, and add Firestore collections/rules needed for this project's core data.",
  },
];

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  "Core",
  "Auth & Access",
  "Commerce",
  "Content",
  "Data & API",
  "Integrations",
];
