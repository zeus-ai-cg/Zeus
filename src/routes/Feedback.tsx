import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useCallback, useEffect, useRef } from "react";
import { listPublicFeedback, type FeedbackRow } from "@/lib/feedback.functions";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { StarRating } from "@/components/feedback/StarRating";
import { FeedbackCard } from "@/components/feedback/FeedbackCard";
import { FeedbackComposer } from "@/components/feedback/FeedbackComposer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Loader2, MessageSquare, TrendingUp, Clock, ThumbsUp, Star } from "lucide-react";

export const Route = createFileRoute("/Feedback")({
  head: () => ({
    meta: [
      { title: "Community Feedback — Zeus AI" },
      {
        name: "description",
        content:
          "See what developers are building with Zeus AI. Read reviews, showcase projects, and share your experience.",
      },
      { property: "og:title", content: "Community Feedback — Zeus AI" },
      {
        property: "og:description",
        content:
          "See what developers are building with Zeus AI. Read reviews, showcase projects, and share your experience.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.zeusai.website/Feedback" },
    ],
  }),
  component: FeedbackPage,
});

const CATEGORIES = [
  { value: "all", label: "All", icon: MessageSquare },
  { value: "general", label: "Reviews", icon: Star },
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "engineer", label: "Engineer", icon: TrendingUp },
  { value: "memory", label: "Memory", icon: Clock },
  { value: "skills", label: "Skills", icon: Star },
  { value: "performance", label: "Performance", icon: TrendingUp },
  { value: "other", label: "Other", icon: MessageSquare },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest", icon: Clock },
  { value: "helpful", label: "Most Helpful", icon: ThumbsUp },
  { value: "highest", label: "Highest Rated", icon: Star },
  { value: "lowest", label: "Lowest Rated", icon: Star },
] as const;

function FeedbackPage() {
  const [showComposer, setShowComposer] = useState(false);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"newest" | "highest" | "lowest" | "helpful">("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Array<FeedbackRow & { profiles: { display_name: string | null; avatar_url: string | null } | null }>>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const listFn = useServerFn(listPublicFeedback);

  const { data, isFetching } = useQuery({
    queryKey: ["public-feedback", category, sort, search, page],
    queryFn: () =>
      listFn({
        data: { page, pageSize: 12, category, sort, search },
      }),
  });

  useEffect(() => {
    if (data) {
      if (page === 1) {
        setAllItems(data.items);
      } else {
        setAllItems((prev) => [...prev, ...data.items]);
      }
      setTotal(data.total);
      setHasMore(data.items.length === 12);
    }
  }, [data, page]);

  // Reset on filter/search change
  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    setPage(1);
    setAllItems([]);
  }, []);

  const handleSortChange = useCallback((s: typeof sort) => {
    setSort(s);
    setPage(1);
    setAllItems([]);
  }, []);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    setAllItems([]);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetching]);

  // Rating distribution
  const ratingDist = [0, 0, 0, 0, 0];
  allItems.forEach((item) => {
    if (item.rating >= 1 && item.rating <= 5) ratingDist[item.rating - 1]++;
  });
  const avgRating = allItems.length
    ? (allItems.reduce((sum, item) => sum + item.rating, 0) / allItems.length).toFixed(1)
    : "0.0";

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-background to-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <Badge variant="secondary" className="mb-4">
            Community
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            What are people building{" "}
            <span className="bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
              with Zeus?
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Share your experience, showcase what you built, and help us improve Zeus AI.
          </p>
          <Button
            size="lg"
            className="mt-8 bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
            onClick={() => setShowComposer(true)}
          >
            Give Feedback
          </Button>
        </div>
      </section>

      {/* Stats bar */}
      {allItems.length > 0 && (
        <section className="border-b bg-muted/30">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-8 px-4 py-6 text-sm">
            <div className="flex items-center gap-2">
              <Star className="size-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{avgRating}</span>
              <span className="text-muted-foreground">avg rating</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="font-semibold">{total}</span>
              <span className="text-muted-foreground">reviews</span>
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-1">
                  <span className="w-3 text-right text-xs text-muted-foreground">{star}</span>
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-yellow-400 transition-all"
                      style={{
                        width: `${allItems.length ? (ratingDist[star - 1] / allItems.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Filters + Search */}
      <section className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? "default" : "ghost"}
                  size="sm"
                  className="text-xs"
                  onClick={() => handleCategoryChange(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => handleSortChange(e.target.value as typeof sort)}
                className="rounded-md border bg-background px-3 py-1.5 text-xs"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search feedback..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="h-8 w-48 pl-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback cards */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        {allItems.length === 0 && !isFetching ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageSquare className="mb-4 size-12 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold">No feedback yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Be the first to share your experience with Zeus AI.
            </p>
            <Button className="mt-4" onClick={() => setShowComposer(true)}>
              Give Feedback
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allItems.map((item) => (
              <FeedbackCard key={item.id} feedback={item} />
            ))}
            {/* Skeleton loading */}
            {isFetching &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skel-${i}`} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
          </div>
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="py-8 text-center">
          {isFetching && page > 1 && (
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          )}
          {!hasMore && allItems.length > 0 && (
            <p className="text-sm text-muted-foreground">You&apos;ve reached the end</p>
          )}
        </div>
      </section>

      {/* Feedback composer modal */}
      {showComposer && <FeedbackComposer onClose={() => setShowComposer(false)} />}
    </MarketingLayout>
  );
}
