import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type CommentItem } from "../../api/client";
import { movieCommentsOptions, useViewerKey } from "../../api/queries";
import { useAuth } from "../../common/auth";
import { formatDate } from "../../common/format";
import { useI18n } from "../../common/i18n";
import { Alert, Avatar, Spinner } from "../../components/ui";
import { buttonStyles, textAreaStyles } from "../../components/ui-styles";

const MAX_COMMENT = 1000;
const EMPTY_COMMENTS: CommentItem[] = [];

export default function MovieComments({ movieId }: { movieId: number }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const client = useQueryClient();
  const commentsOptions = movieCommentsOptions(useViewerKey(), movieId);
  const commentsKey = commentsOptions.queryKey;
  const commentsQuery = useQuery(commentsOptions);
  const comments =
    commentsQuery.data ?? (commentsQuery.isError ? EMPTY_COMMENTS : null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const postMutation = useMutation({
    mutationFn: (comment: string) =>
      api<CommentItem>(`/movies/${movieId}/comments`, {
        method: "POST",
        json: { comment },
      }),
    onSuccess: (comment) => {
      client.setQueryData<CommentItem[]>(commentsKey, (list) => [
        comment,
        ...(list ?? []),
      ]);
      setText("");
    },
  });
  const editMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      api<CommentItem>(`/comments/${id}`, {
        method: "PATCH",
        json: { comment },
      }),
    onSuccess: (comment) => {
      client.setQueryData<CommentItem[]>(commentsKey, (list) =>
        (list ?? []).map((item) => (item.id === comment.id ? comment : item)),
      );
      setEditing(null);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: number) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      client.setQueryData<CommentItem[]>(commentsKey, (list) =>
        (list ?? []).filter((item) => item.id !== id),
      ),
  });
  const busy = postMutation.isPending;
  const post = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || value.length > MAX_COMMENT || busy) return;
    setError(null);
    try {
      await postMutation.mutateAsync(value);
    } catch {
      setError(t("err.generic"));
    }
  };
  const saveEdit = async (id: number) => {
    const value = editText.trim();
    if (!value || value.length > MAX_COMMENT || editMutation.isPending) return;
    setError(null);
    try {
      await editMutation.mutateAsync({ id, comment: value });
    } catch {
      setError(t("err.generic"));
    }
  };
  const remove = async (id: number) => {
    setError(null);
    try {
      await removeMutation.mutateAsync(id);
    } catch {
      setError(t("err.generic"));
    }
  };

  const left = MAX_COMMENT - text.length;
  return (
    <section
      className={`
      comments [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2.5 [&_.count]:text-[0.8rem] [&_.count]:font-sans
      [&_.count]:bg-surface-high [&_.count]:text-secondary [&_.count]:pt-0.5 [&_.count]:pb-0.5
      [&_.count]:pl-2.5 [&_.count]:pr-2.5 [&_.count]:rounded-[999px]
    `}
    >
      <h2>
        {t("movie.comments")}{" "}
        {comments && <span className="count">{comments.length}</span>}
      </h2>
      {user && (
        <form className="flex gap-3.5 mb-6.5" onSubmit={post}>
          <Avatar
            url={user.profile_picture_url}
            name={user.username}
            first={user.first_name}
            last={user.last_name}
            size={40}
          />
          <div className="flex-1 min-w-0 grid gap-2.5">
            <textarea
              className={textAreaStyles}
              value={text}
              maxLength={MAX_COMMENT}
              rows={3}
              placeholder={t("movie.comment_placeholder")}
              aria-label={t("movie.comment_placeholder")}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-between items-center gap-2.5">
              <span
                className={`text-[0.82rem] ${left < 100 ? "text-highlight" : "text-muted"}`}
              >
                {t("movie.chars_left", { n: left })}
              </span>
              <button
                className={buttonStyles({ variant: "primary", size: "small" })}
                disabled={busy || !text.trim()}
              >
                {busy ? <Spinner size={16} /> : t("movie.post")}
              </button>
            </div>
          </div>
        </form>
      )}
      {(error || commentsQuery.isError) && (
        <Alert>{error ?? t("err.generic")}</Alert>
      )}
      {comments === null ? (
        <div className="grid place-items-center p-8.5">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted py-4.5 px-0">{t("movie.no_comments")}</p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`
              comment [transition:background_0.2s] animate-[rise_0.35s_var(--ease)] hover:bg-surface mobile:pt-3
              mobile:pb-3 mobile:pl-1 mobile:pr-1 flex gap-3.5 p-4 rounded-card
            `}
            >
              <Link to={`/users/${c.user_id}`} aria-label={c.username}>
                <Avatar
                  url={c.author_picture_url}
                  name={c.username}
                  size={40}
                />
              </Link>
              <div className="flex-1 min-w-0 grid gap-1.5">
                <div className="comment-head [&_time]:text-muted [&_time]:text-[0.8rem] flex items-baseline gap-2.5 flex-wrap text-[0.86rem]">
                  <Link
                    to={`/users/${c.user_id}`}
                    className="comment-author hover:text-highlight font-semibold"
                  >
                    {c.username}
                  </Link>
                  <time dateTime={c.date}>{formatDate(c.date, lang)}</time>
                  {c.updated_at && (
                    <span className="text-muted small text-[0.82rem]">
                      · {t("movie.edited")}
                    </span>
                  )}
                </div>
                {editing === c.id ? (
                  <div className="comment-edit [&_.comment-actions]:gap-2 grid gap-2.5">
                    <textarea
                      className={textAreaStyles}
                      value={editText}
                      maxLength={MAX_COMMENT}
                      rows={3}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label={t("movie.edit")}
                    />
                    <div className="comment-actions flex gap-3.5">
                      <button
                        className={buttonStyles({
                          variant: "primary",
                          size: "small",
                        })}
                        onClick={() => void saveEdit(c.id)}
                        disabled={!editText.trim()}
                      >
                        {t("movie.save")}
                      </button>
                      <button
                        className={buttonStyles({
                          variant: "ghost",
                          size: "small",
                        })}
                        onClick={() => setEditing(null)}
                      >
                        {t("movie.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary whitespace-pre-wrap wrap-anywhere">
                    {c.comment}
                  </p>
                )}
                {user?.id === c.user_id && editing !== c.id && (
                  <div className="comment-actions flex gap-3.5">
                    <button
                      className="link-btn bg-transparent hover:text-foreground [&.danger:hover]:text-danger border-0 p-0 text-muted text-[0.82rem] font-medium"
                      onClick={() => {
                        setEditing(c.id);
                        setEditText(c.comment);
                      }}
                    >
                      {t("movie.edit")}
                    </button>
                    <button
                      className="link-btn bg-transparent hover:text-foreground [&.danger:hover]:text-danger border-0 p-0 text-muted text-[0.82rem] font-medium danger"
                      onClick={() => void remove(c.id)}
                    >
                      {t("movie.delete")}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
