import { useMemo, useState, type ChangeEvent } from "react";

import type { FileAsset, QuestionChallengeInput, QuestionCommentInput } from "@aios/api-sdk";

export interface QuestionFeedbackPageApi {
  createQuestionComment(questionId: number, body: QuestionCommentInput): Promise<boolean>;
  createQuestionChallenge(questionId: number, body: QuestionChallengeInput): Promise<boolean>;
  uploadFile(body: FormData): Promise<FileAsset>;
}

interface QuestionFeedbackPageProps {
  api: QuestionFeedbackPageApi;
  path: string;
  onNavigate(path: string): void;
}

interface ActivityItem {
  id: string;
  kind: "comment" | "challenge";
  content: string;
  created_at: string;
}

type ParsedQuestionFeedbackPath =
  | { ok: false }
  | {
      ok: true;
      question_id: number;
      question_version_id: number;
      question_type: string;
      stem: string;
      from: string;
    };

const challengeTypeOptions = [
  { value: "wrong_answer", label: "答案有误" },
  { value: "wrong_stem", label: "题干有误" },
  { value: "wrong_option", label: "选项有误" },
  { value: "typo", label: "文字错误" },
  { value: "dispute", label: "解析争议" },
  { value: "other", label: "其他问题" }
];

export function QuestionFeedbackPage({ api, path, onNavigate }: QuestionFeedbackPageProps) {
  const parsed = useMemo(() => parseQuestionFeedbackPath(path), [path]);
  const [commentDraft, setCommentDraft] = useState("");
  const [challengeType, setChallengeType] = useState("wrong_answer");
  const [challengeDraft, setChallengeDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commentMessage, setCommentMessage] = useState("");
  const [challengeMessage, setChallengeMessage] = useState("");
  const [attachments, setAttachments] = useState<FileAsset[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  if (!parsed.ok) {
    return (
      <section aria-label="题目评论与质疑页">
        <h2>题目评论与质疑</h2>
        <p>题目参数无效。</p>
      </section>
    );
  }

  const context = parsed;

  async function handleCommentSubmit() {
    const content = commentDraft.trim();
    if (!content) {
      setCommentMessage("请输入评论内容。");
      return;
    }

    setSubmittingComment(true);
    setCommentMessage("");
    try {
      await api.createQuestionComment(context.question_id, {
        question_version_id: context.question_version_id,
        content,
        comment_type: "discussion",
        is_private: false,
        parent_comment_id: null
      });
      setActivity((current) => [
        {
          id: `comment-${Date.now()}`,
          kind: "comment",
          content,
          created_at: new Date().toLocaleString("zh-CN")
        },
        ...current
      ]);
      setCommentDraft("");
      setCommentMessage("评论已提交。");
    } catch {
      setCommentMessage("评论提交失败，请稍后重试。");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleChallengeSubmit() {
    const description = challengeDraft.trim();
    if (!description) {
      setChallengeMessage("请输入质疑说明。");
      return;
    }

    setSubmittingChallenge(true);
    setChallengeMessage("");
    try {
      await api.createQuestionChallenge(context.question_id, {
        question_version_id: context.question_version_id,
        challenge_type: challengeType,
        description,
        attachments: attachments
          .map((asset) => ({
            url: asset.url ?? asset.original_url ?? "",
            type: resolveAttachmentType(asset)
          }))
          .filter((item) => item.url)
      });
      setActivity((current) => [
        {
          id: `challenge-${Date.now()}`,
          kind: "challenge",
          content: description,
          created_at: new Date().toLocaleString("zh-CN")
        },
        ...current
      ]);
      setChallengeDraft("");
      setChallengeMessage("质疑已提交。");
    } catch {
      setChallengeMessage("质疑提交失败，请稍后重试。");
    } finally {
      setSubmittingChallenge(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const body = new FormData();
          body.append("file", file);
          body.append("usage", "challenge_attachment");
          const asset = await api.uploadFile(body);
          return {
            ...asset,
            original_filename: asset.original_filename ?? file.name,
            mime_type: asset.mime_type ?? file.type
          };
        })
      );
      setAttachments((current) => [...current, ...uploaded]);
      setChallengeMessage("");
    } catch {
      setChallengeMessage("附件上传失败，请稍后重试。");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <section aria-label="题目评论与质疑页" className="ui-user-page">
      <div className="ui-page-header">
        <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate(context.from)}>
          返回上一页
        </button>
        <div>
          <p className="ui-page-breadcrumb">练题中心 / 题目互动</p>
          <h2>题目评论与质疑</h2>
        </div>
      </div>

      <div className="ui-user-grid ui-user-grid--feedback">
        <section className="ui-user-card">
          <p className="ui-user-card__eyebrow">题目概览</p>
          <h3>第 {context.question_id} 题</h3>
          <p>{context.stem}</p>
          <dl className="ui-user-kv">
            <div>
              <dt>题型</dt>
                  <dd>{context.question_type}</dd>
            </div>
            <div>
              <dt>版本</dt>
                  <dd>{context.question_version_id}</dd>
            </div>
          </dl>
        </section>

        <section className="ui-user-card">
          <p className="ui-user-card__eyebrow">评论流</p>
          <h3>发表评论</h3>
          <label htmlFor="question_feedback_comment">评论内容</label>
          <textarea
            id="question_feedback_comment"
            rows={5}
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
          />
          <div className="ui-inline-actions">
            <button type="button" className="ui-button" onClick={() => void handleCommentSubmit()} disabled={submittingComment}>
              提交评论
            </button>
            {commentMessage ? <p>{commentMessage}</p> : null}
          </div>
          <ul className="ui-activity-list">
            {activity.filter((item) => item.kind === "comment").map((item) => (
              <li key={item.id}>
                <strong>评论</strong>
                <p>{item.content}</p>
                <span>{item.created_at}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ui-user-card">
          <p className="ui-user-card__eyebrow">质疑表单</p>
          <h3>发起质疑</h3>
          <label htmlFor="question_feedback_type">质疑类型</label>
          <select
            id="question_feedback_type"
            value={challengeType}
            onChange={(event) => setChallengeType(event.target.value)}
          >
            {challengeTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <label htmlFor="question_feedback_description">质疑说明</label>
          <textarea
            id="question_feedback_description"
            rows={6}
            value={challengeDraft}
            onChange={(event) => setChallengeDraft(event.target.value)}
          />

          <label htmlFor="question_feedback_attachments">质疑附件</label>
          <input
            id="question_feedback_attachments"
            type="file"
            multiple
            onChange={(event) => void handleUpload(event)}
          />
          {uploading ? <p>正在上传附件...</p> : null}
          {attachments.length > 0 ? (
            <ul className="ui-attachment-list">
              {attachments.map((asset) => (
                <li key={asset.id}>{asset.original_filename ?? extractFileName(asset.object_key)}</li>
              ))}
            </ul>
          ) : null}

          <div className="ui-inline-actions">
            <button
              type="button"
              className="ui-button"
              onClick={() => void handleChallengeSubmit()}
              disabled={submittingChallenge}
            >
              提交质疑
            </button>
            {challengeMessage ? <p>{challengeMessage}</p> : null}
          </div>
          <ul className="ui-activity-list">
            {activity.filter((item) => item.kind === "challenge").map((item) => (
              <li key={item.id}>
                <strong>质疑</strong>
                <p>{item.content}</p>
                <span>{item.created_at}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

export function buildQuestionFeedbackPath(input: {
  question_id: number;
  question_version_id: number;
  question_type: string;
  stem: string;
  from: string;
}): string {
  const search = new URLSearchParams();
  search.set("question_id", String(input.question_id));
  search.set("question_version_id", String(input.question_version_id));
  search.set("question_type", input.question_type);
  search.set("stem", input.stem);
  search.set("from", input.from);
  return `/app/questions/feedback?${search.toString()}`;
}

function parseQuestionFeedbackPath(path: string): ParsedQuestionFeedbackPath {
  let url: URL;
  try {
    url = new URL(path, "http://localhost");
  } catch {
    return { ok: false };
  }

  const question_id = parsePositiveInt(url.searchParams.get("question_id"));
  const question_version_id = parsePositiveInt(url.searchParams.get("question_version_id"));
  const question_type = url.searchParams.get("question_type")?.trim() ?? "";
  const stem = url.searchParams.get("stem")?.trim() ?? "";
  const from = url.searchParams.get("from")?.trim() ?? "";

  if (!question_id || !question_version_id || !question_type || !stem || !from) {
    return { ok: false };
  }

  return {
    ok: true,
    question_id,
    question_version_id,
    question_type,
    stem,
    from
  };
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function extractFileName(objectKey: string): string {
  const parts = objectKey.split("/");
  return parts[parts.length - 1] || objectKey;
}

function resolveAttachmentType(asset: FileAsset): string {
  if (asset.mime_type?.startsWith("image/")) {
    return "image";
  }
  return "file";
}
