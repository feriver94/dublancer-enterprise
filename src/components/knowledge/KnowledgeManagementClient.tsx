"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type Dashboard = {
  reviewers: Array<{ id: string; user: { id: string; displayName?: string | null; email: string } }>;
  categories: Array<{ id: string; name: string; slug: string; _count: { articles: number; faqs: number } }>;
  articles: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    currentVersion: number;
    publishedVersion?: number | null;
    owner: { id: string; displayName?: string | null; email: string };
    category?: { name: string } | null;
    versions: Array<{ id: string; version: number; changeSummary?: string | null; createdAt: string }>;
    approvals: Array<{
      id: string;
      reviewerId: string;
      decision: string;
      comment?: string | null;
      reviewer: { displayName?: string | null; email: string };
      version: { version: number };
    }>;
  }>;
  faqs: Array<{ id: string; question: string; answer: string; status: string; locale: string }>;
  retrievals: Array<{ id: string; query: string; mode: string; confidence?: number | null; latencyMs: number }>;
  analytics: { publishedArticles: number; pendingApprovals: number };
};

type Retrieval = {
  answer: string;
  confidence: number;
  mode: string;
  latencyMs: number;
  sources: Array<{ articleId: string; title: string; version: number; excerpt: string }>;
  aiRun?: { id: string; status: string } | null;
};

const field = {
  width: "100%",
  border: `1px solid ${brand.colors.border}`,
  borderRadius: brand.radius.md,
  padding: "11px 12px",
  background: brand.colors.white,
  color: brand.colors.navy,
};

export function KnowledgeManagementClient({
  currentUserId,
  canManage,
  canApprove,
}: {
  currentUserId: string;
  canManage: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("Phase9Knowledge");
  const common = useTranslations("Common");
  const dashboard = useApiResource<Dashboard>("/api/knowledge/overview");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [retrieval, setRetrieval] = useState<Retrieval | null>(null);

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setNotice("");
    setError("");
    try {
      const result = await operation();
      setNotice(common("completed"));
      await dashboard.refresh();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
      return null;
    } finally {
      setPending("");
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("category", () =>
      apiMutation("/api/knowledge/overview", "POST", {
        action: "category.create",
        name: String(values.get("name")),
        slug: String(values.get("slug")),
      }),
    );
    form.reset();
  }

  async function createArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("article", () =>
      apiMutation("/api/knowledge/overview", "POST", {
        action: "article.create",
        categoryId: String(values.get("categoryId") || "") || undefined,
        slug: String(values.get("slug")),
        title: String(values.get("title")),
        summary: String(values.get("summary") || "") || undefined,
        body: String(values.get("body")),
        locale: "en-AE",
        isInternal: true,
      }),
    );
    form.reset();
  }

  async function createFaq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("faq", () =>
      apiMutation("/api/knowledge/overview", "POST", {
        action: "faq.upsert",
        question: String(values.get("question")),
        answer: String(values.get("answer")),
        locale: "en-AE",
        publish: true,
        sortOrder: 0,
      }),
    );
    form.reset();
  }

  async function retrieve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const result = await mutate("retrieve", () =>
      apiMutation<Retrieval>("/api/knowledge/retrieve", "POST", {
        query: String(values.get("query")),
        take: 5,
        aiAssist: values.get("aiAssist") === "on",
        idempotencyKey: `knowledge-ui-${Date.now()}`,
      }),
    );
    if (result) setRetrieval(result as Retrieval);
  }

  async function submitArticle(article: Dashboard["articles"][number]) {
    const reviewer = dashboard.data?.reviewers.find(
      (row) => row.user.id !== article.owner.id,
    );
    if (!reviewer) {
      setError("An independent knowledge approver is required.");
      return;
    }
    await mutate(`submit-${article.id}`, () =>
      apiMutation("/api/knowledge/overview", "POST", {
        action: "article.submit",
        articleId: article.id,
        reviewerIds: [reviewer.user.id],
      }),
    );
  }

  if (dashboard.loading) return <p>{common("loading")}</p>;
  const data = dashboard.data;

  return (
    <main style={{ padding: "64px 0 96px", display: "grid", gap: 24 }}>
      <div>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 style={{ color: brand.colors.navy, fontSize: 40, margin: "16px 0 10px" }}>{t("title")}</h1>
        <p style={{ color: brand.colors.muted, maxWidth: 860 }}>{t("description")}</p>
      </div>
      {(notice || error || dashboard.error) && (
        <Card variant="glass">
          <strong style={{ color: error ? "#B42318" : brand.colors.green }}>
            {error || dashboard.error || notice}
          </strong>
        </Card>
      )}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          [t("articles"), data?.articles.length ?? 0],
          [t("published"), data?.analytics.publishedArticles ?? 0],
          [t("pendingApprovals"), data?.analytics.pendingApprovals ?? 0],
          [t("faqs"), data?.faqs.length ?? 0],
          [t("categories"), data?.categories.length ?? 0],
          [t("retrieval"), data?.retrievals.length ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", fontSize: 26, color: brand.colors.navy, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(350px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("articleLifecycle")}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(data?.articles ?? []).map((article) => (
              <div key={article.id} style={{ border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md, padding: 12 }}>
                <strong>{article.title}</strong>
                <div style={{ color: brand.colors.muted }}>
                  {article.status} · v{article.currentVersion} · {article.category?.name ?? "—"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {canManage && article.status === "DRAFT" && (
                    <Button variant="outline" disabled={Boolean(pending)} onClick={() => void submitArticle(article)}>{t("submit")}</Button>
                  )}
                  {canApprove && article.approvals.filter((row) => row.reviewerId === currentUserId && row.decision === "PENDING").map((approval) => (
                    <Button key={approval.id} disabled={Boolean(pending)} onClick={() => void mutate(`approve-${approval.id}`, () => apiMutation("/api/knowledge/overview", "POST", { action: "approval.decide", approvalId: approval.id, decision: "APPROVED", comment: "Approved for publication." }))}>{t("approve")}</Button>
                  ))}
                  {canManage && canApprove && article.status === "APPROVED" && (
                    <Button disabled={Boolean(pending)} onClick={() => void mutate(`publish-${article.id}`, () => apiMutation("/api/knowledge/overview", "POST", { action: "article.publish", articleId: article.id }))}>{t("publish")}</Button>
                  )}
                </div>
              </div>
            ))}
            {!data?.articles.length && <p>{t("noData")}</p>}
          </div>
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("retrieval")}</h2>
          <form onSubmit={retrieve} style={{ display: "grid", gap: 10 }}>
            <textarea required name="query" placeholder={t("query")} style={field} />
            <label style={{ color: brand.colors.muted }}><input name="aiAssist" type="checkbox" /> {t("aiAssist")}</label>
            <Button type="submit" disabled={Boolean(pending)}>{t("search")}</Button>
          </form>
          {retrieval && (
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <strong>{retrieval.mode} · {Math.round(retrieval.confidence * 100)}% · {retrieval.latencyMs}ms</strong>
              <p style={{ whiteSpace: "pre-wrap", color: brand.colors.muted }}>{retrieval.answer}</p>
              {retrieval.sources.map((source) => (
                <small key={source.articleId}>{source.title} · v{source.version}</small>
              ))}
            </div>
          )}
        </Card>
        {canManage && (
          <Card variant="elevated">
            <h2 style={{ color: brand.colors.navy }}>{t("newArticle")}</h2>
            <form onSubmit={createArticle} style={{ display: "grid", gap: 10 }}>
              <select name="categoryId" style={field} defaultValue="">
                <option value="">{t("categories")}</option>
                {(data?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <input required name="slug" placeholder={t("slug")} style={field} />
              <input required name="title" placeholder={t("titleLabel")} style={field} />
              <input name="summary" placeholder={t("summary")} style={field} />
              <textarea required name="body" rows={8} placeholder={t("body")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          </Card>
        )}
        {canManage && (
          <Card variant="elevated">
            <h2 style={{ color: brand.colors.navy }}>{t("newCategory")}</h2>
            <form onSubmit={createCategory} style={{ display: "grid", gap: 10 }}>
              <input required name="name" placeholder={t("name")} style={field} />
              <input required name="slug" placeholder={t("slug")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
            <h2 style={{ color: brand.colors.navy, marginTop: 24 }}>{t("newFaq")}</h2>
            <form onSubmit={createFaq} style={{ display: "grid", gap: 10 }}>
              <input required name="question" placeholder={t("question")} style={field} />
              <textarea required name="answer" placeholder={t("answer")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          </Card>
        )}
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("history")}</h2>
          {(data?.faqs ?? []).map((faq) => (
            <div key={faq.id} style={{ padding: "9px 0", borderBottom: `1px solid ${brand.colors.border}` }}>
              <strong>{faq.question}</strong>
              <div style={{ color: brand.colors.muted }}>{faq.status} · {faq.locale}</div>
            </div>
          ))}
        </Card>
      </section>
    </main>
  );
}
