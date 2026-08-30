import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Helper: cast Supabase client for tables not yet in generated types
// (will be fixed automatically after `supabase gen types typescript` is re-run)
type AnySupabase = Record<string, any>;

// ============================================================================
// Types
// ============================================================================

export type FeedbackCategory =
  | "general"
  | "chat"
  | "engineer"
  | "memory"
  | "skills"
  | "desktop"
  | "vscode"
  | "billing"
  | "performance"
  | "other";

export type FeedbackVisibility = "public" | "private";
export type FeedbackStatus = "published" | "hidden" | "deleted";

export interface FeedbackRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  rating: number;
  category: string;
  visibility: string;
  status: string;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
  user_voted?: boolean;
}

export interface FeedbackAttachment {
  id: string;
  feedback_id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface FeedbackProject {
  id: string;
  feedback_id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string | null;
  preview_metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface FeedbackConversation {
  id: string;
  feedback_id: string;
  created_by: string;
  title: string | null;
  message_count: number;
  created_at: string;
  messages?: FeedbackMessage[];
}

export interface FeedbackMessage {
  id: string;
  public_conversation_id: string;
  role: string;
  content: string;
  display_order: number;
  created_at: string;
}

// ============================================================================
// PUBLIC: List public feedback (infinite scroll / pagination)
// ============================================================================

const listPublicFeedbackSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(12),
  category: z.string().default("all"),
  sort: z.enum(["newest", "highest", "lowest", "helpful"]).default("newest"),
  search: z.string().default(""),
  authorId: z.string().uuid().optional(),
});

export const listPublicFeedback = createServerFn({ method: "GET" })
  .validator((input: unknown) => listPublicFeedbackSchema.parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    ) as unknown as AnySupabase;

    // First try with profiles join; if it fails (e.g. anon can't read profiles),
    // fall back to a plain query without the join.
    let query = supabase
      .from("feedback")
      .select(
        `
        id, user_id, title, body, rating, category, visibility, status,
        helpful_count, created_at, updated_at,
        profiles(display_name, avatar_url)
      `,
        { count: "exact" },
      )
      .eq("visibility", "public")
      .eq("status", "published");

    if (data.authorId) {
      query = query.eq("user_id", data.authorId);
    }
    if (data.category !== "all") {
      query = query.eq("category", data.category);
    }
    if (data.search) {
      query = query.or(`title.ilike.%${data.search}%,body.ilike.%${data.search}%`);
    }

    switch (data.sort) {
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "highest":
        query = query.order("rating", { ascending: false }).order("created_at", { ascending: false });
        break;
      case "lowest":
        query = query.order("rating", { ascending: true }).order("created_at", { ascending: false });
        break;
      case "helpful":
        query = query.order("helpful_count", { ascending: false }).order("created_at", { ascending: false });
        break;
    }

    const offset = (data.page - 1) * data.pageSize;
    query = query.range(offset, offset + data.pageSize - 1);

    let { data: rows, error, count } = await query;

    // Fallback: if profiles join fails, retry without it
    if (error && error.message?.includes("profiles")) {
      let fallback = supabase
        .from("feedback")
        .select(
          `id, user_id, title, body, rating, category, visibility, status, helpful_count, created_at, updated_at`,
          { count: "exact" },
        )
        .eq("visibility", "public")
        .eq("status", "published");

      if (data.authorId) fallback = fallback.eq("user_id", data.authorId);
      if (data.category !== "all") fallback = fallback.eq("category", data.category);
      if (data.search) fallback = fallback.or(`title.ilike.%${data.search}%,body.ilike.%${data.search}%`);

      switch (data.sort) {
        case "newest": fallback = fallback.order("created_at", { ascending: false }); break;
        case "highest": fallback = fallback.order("rating", { ascending: false }).order("created_at", { ascending: false }); break;
        case "lowest": fallback = fallback.order("rating", { ascending: true }).order("created_at", { ascending: false }); break;
        case "helpful": fallback = fallback.order("helpful_count", { ascending: false }).order("created_at", { ascending: false }); break;
      }

      fallback = fallback.range(offset, offset + data.pageSize - 1);
      const fb = await fallback;
      rows = fb.data;
      count = fb.count;
      error = fb.error;
    }

    if (error) throw new Error(error.message);

    return {
      items: (rows ?? []) as Array<FeedbackRow & { profiles: { display_name: string | null; avatar_url: string | null } | null }>,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ============================================================================
// PUBLIC: Get single feedback detail
// ============================================================================

export const getPublicFeedback = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ feedbackId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    ) as unknown as AnySupabase;

    const { data: row, error } = await supabase
      .from("feedback")
      .select(
        `
        id, user_id, title, body, rating, category, visibility, status,
        helpful_count, created_at, updated_at,
        profiles(display_name, avatar_url),
        feedback_attachments(id, file_name, mime_type, file_size, storage_path),
        feedback_projects(id, title, description, preview_metadata, project_id),
        public_feedback_conversations(
          id, title, message_count, created_at,
          public_feedback_messages(id, role, content, display_order, created_at)
        )
      `,
      )
      .eq("id", data.feedbackId)
      .eq("visibility", "public")
      .eq("status", "published")
      .single();

    if (error || !row) return null;

    const result = row as FeedbackRow & {
      profiles: { display_name: string | null; avatar_url: string | null } | null;
      feedback_attachments: FeedbackAttachment[];
      feedback_projects: FeedbackProject[];
      public_feedback_conversations: Array<
        FeedbackConversation & { public_feedback_messages: FeedbackMessage[] }
      >;
    };

    for (const conv of result.public_feedback_conversations ?? []) {
      conv.messages = (conv.public_feedback_messages ?? []).sort(
        (a, b) => a.display_order - b.display_order,
      );
    }

    return result as any;
  });

// ============================================================================
// AUTHENTICATED: Get my feedback list
// ============================================================================

export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { data, error } = await supabase
      .from("feedback")
      .select(
        `
        id, title, body, rating, category, visibility, status,
        helpful_count, created_at, updated_at,
        feedback_attachments(id, file_name, mime_type),
        feedback_projects(id, title),
        public_feedback_conversations(id, title, message_count)
      `,
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============================================================================
// AUTHENTICATED: Create feedback
// ============================================================================

const createFeedbackSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(10).max(5000),
  rating: z.number().int().min(1).max(5),
  category: z.enum([
    "general", "chat", "engineer", "memory", "skills",
    "desktop", "vscode", "billing", "performance", "other",
  ]),
  visibility: z.enum(["public", "private"]).default("public"),
});

export const createFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createFeedbackSchema.parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { data: row, error } = await supabase
      .from("feedback")
      .insert({
        user_id: context.userId,
        title: data.title || null,
        body: data.body,
        rating: data.rating,
        category: data.category,
        visibility: data.visibility,
      })
      .select("id, title, body, rating, category, visibility, status, helpful_count, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

// ============================================================================
// AUTHENTICATED: Update feedback
// ============================================================================

const updateFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  title: z.string().max(200).optional(),
  body: z.string().min(10).max(5000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  category: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export const updateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateFeedbackSchema.parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.body !== undefined) updates.body = data.body;
    if (data.rating !== undefined) updates.rating = data.rating;
    if (data.category !== undefined) updates.category = data.category;
    if (data.visibility !== undefined) updates.visibility = data.visibility;

    const { error } = await supabase
      .from("feedback")
      .update(updates)
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// AUTHENTICATED: Delete feedback (soft delete)
// ============================================================================

export const deleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ feedbackId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { error } = await supabase
      .from("feedback")
      .update({ status: "deleted", visibility: "private" })
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// AUTHENTICATED: Toggle vote
// ============================================================================

export const toggleFeedbackVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ feedbackId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { data: result, error } = await supabase.rpc("toggle_feedback_vote", {
      p_feedback_id: data.feedbackId,
      p_user_id: context.userId,
    });

    if (error) throw new Error(error.message);
    return result as { voted: boolean; helpful_count: number };
  });

// ============================================================================
// AUTHENTICATED: Report feedback
// ============================================================================

const reportFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  reason: z.enum([
    "spam", "harassment", "personal_info", "malicious",
    "copyright", "sensitive_info", "other",
  ]),
  details: z.string().max(1000).optional(),
});

export const reportFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reportFeedbackSchema.parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { error } = await supabase.from("feedback_reports").insert({
      feedback_id: data.feedbackId,
      reporter_user_id: context.userId,
      reason: data.reason,
      details: data.details || null,
    });

    if (error) {
      if (error.code === "23505") throw new Error("You have already reported this feedback.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ============================================================================
// AUTHENTICATED: Create public conversation snapshot
// ============================================================================

const createConversationSnapshotSchema = z.object({
  feedbackId: z.string().uuid(),
  title: z.string().max(200).optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(50000),
    }),
  ).min(1).max(100),
});

export const createConversationSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createConversationSnapshotSchema.parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;

    const { data: fb, error: fbErr } = await supabase
      .from("feedback")
      .select("id, user_id")
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .single();

    if (fbErr || !fb) throw new Error("Feedback not found or access denied.");

    const { data: conv, error: convErr } = await supabase
      .from("public_feedback_conversations")
      .insert({
        feedback_id: data.feedbackId,
        created_by: context.userId,
        title: data.title || null,
        message_count: data.messages.length,
      })
      .select("id")
      .single();

    if (convErr) throw new Error(convErr.message);

    const msgs = data.messages.map((m, i) => ({
      public_conversation_id: conv.id,
      role: m.role,
      content: m.content,
      display_order: i,
    }));

    const { error: msgErr } = await supabase
      .from("public_feedback_messages")
      .insert(msgs);

    if (msgErr) throw new Error(msgErr.message);

    return { conversationId: conv.id };
  });

// ============================================================================
// AUTHENTICATED: Attach project to feedback
// ============================================================================

const attachProjectSchema = z.object({
  feedbackId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().max(200),
  description: z.string().max(1000).optional(),
});

export const attachProjectToFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => attachProjectSchema.parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;

    const { data: proj, error: projErr } = await supabase
      .from("workspace_projects")
      .select("id, user_id, name, framework, primary_language, file_count")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .single();

    if (projErr || !proj) throw new Error("Project not found or access denied.");

    const { data: fb, error: fbErr } = await supabase
      .from("feedback")
      .select("id, user_id")
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .single();

    if (fbErr || !fb) throw new Error("Feedback not found or access denied.");

    const { error } = await supabase.from("feedback_projects").insert({
      feedback_id: data.feedbackId,
      user_id: context.userId,
      project_id: data.projectId,
      title: data.title,
      description: data.description || null,
      preview_metadata: {
        framework: proj.framework,
        primary_language: proj.primary_language,
        file_count: proj.file_count,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// AUTHENTICATED: Remove attachment from feedback
// ============================================================================

export const removeFeedbackAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z.object({
        attachmentId: z.string().uuid(),
        type: z.enum(["attachment", "project", "conversation"]),
      }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    let table: string;
    let ownerCol: string;

    switch (data.type) {
      case "attachment":
        table = "feedback_attachments";
        ownerCol = "user_id";
        break;
      case "project":
        table = "feedback_projects";
        ownerCol = "user_id";
        break;
      case "conversation":
        table = "public_feedback_conversations";
        ownerCol = "created_by";
        break;
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", data.attachmentId)
      .eq(ownerCol, context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// PUBLIC: Get user's public profile/showcase
// ============================================================================

export const getPublicUserProfile = createServerFn({ method: "GET" })
  .validator(
    (input: unknown) =>
      z.union([
        z.object({ userId: z.string().uuid() }),
        z.object({ username: z.string() }),
      ]).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    );

    let profileQuery = supabase
      .from("profiles")
      .select("id, display_name, avatar_url, created_at");

    if ("userId" in data) {
      profileQuery = profileQuery.eq("id", data.userId);
    } else {
      profileQuery = profileQuery.eq("display_name", data.username);
    }

    const { data: profile, error: profErr } = await profileQuery.single();

    if (profErr || !profile) return null;

    return {
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
      showcase_projects: [] as Array<{
        id: string;
        title: string;
        description: string | null;
        preview_metadata: Record<string, string | number | boolean | null>;
      }>,
    };
  });

// ============================================================================
// AUTHENTICATED: Upload attachment for feedback
// ============================================================================

export const getFeedbackUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z
        .object({
          feedbackId: z.string().uuid(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string(),
          fileSize: z.number().int().min(1).max(10 * 1024 * 1024),
        })
        .parse(input),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;

    const allowedTypes = [
      "image/png", "image/jpeg", "image/gif", "image/webp",
      "application/pdf", "text/plain", "text/markdown",
    ];
    if (!allowedTypes.includes(data.mimeType)) {
      throw new Error("File type not allowed.");
    }

    const { data: fb, error: fbErr } = await supabase
      .from("feedback")
      .select("id, user_id")
      .eq("id", data.feedbackId)
      .eq("user_id", context.userId)
      .single();

    if (fbErr || !fb) throw new Error("Feedback not found or access denied.");

    const ext = data.fileName.split(".").pop() ?? "bin";
    const storagePath = `${context.userId}/${data.feedbackId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("feedback-attachments")
      .upload(storagePath, new Uint8Array(0), {
        contentType: data.mimeType,
        upsert: false,
      });

    if (uploadErr) throw new Error(uploadErr.message);

    const { data: att, error: attErr } = await supabase
      .from("feedback_attachments")
      .insert({
        feedback_id: data.feedbackId,
        user_id: context.userId,
        storage_path: storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: data.fileSize,
      })
      .select("id, storage_path, file_name, mime_type, file_size, created_at")
      .single();

    if (attErr) throw new Error(attErr.message);

    const { data: signedUrl, error: signErr } = await supabase.storage
      .from("feedback-attachments")
      .createSignedUploadUrl(storagePath);

    if (signErr) throw new Error(signErr.message);

    return {
      attachment: att,
      signedUploadUrl: signedUrl.signedUrl,
      storagePath,
    };
  });

// ============================================================================
// AUTHENTICATED: Confirm upload completed
// ============================================================================

export const confirmFeedbackUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z
        .object({
          attachmentId: z.string().uuid(),
          storagePath: z.string(),
        })
        .parse(input),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as AnySupabase;

    const { error } = await supabase
      .from("feedback_attachments")
      .update({ file_size: 0 })
      .eq("id", data.attachmentId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
