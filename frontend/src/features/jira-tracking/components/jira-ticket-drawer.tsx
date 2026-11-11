import { useState } from 'react';
import { CornerUpLeft, ExternalLink, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import { jiraIssueUrl } from '@/lib/api/jira';
import type { JiraTrackingItem } from '@/lib/api/types';
import { cn, formatDate } from '@/lib/utils';
import { adfToText } from '../lib/adf';
import { useAddJiraComment, useJiraComments } from '../use-jira-tracking';

const STATUS_TONE = (status: string): 'ok' | 'warn' | 'brand' | 'neutral' => {
  const value = status.toUpperCase();
  if (value.includes('DONE') || value.includes('FIXED') || value.includes('CERRADO')) return 'ok';
  if (value.includes('PROGRESS') || value.includes('DOING') || value.includes('PROGRESO')) return 'brand';
  if (value.includes('TODO') || value.includes('PENDING') || value.includes('BACKLOG')) return 'neutral';
  return 'warn';
};

export function JiraTicketDrawer({
  ticket,
  projectId,
  onClose,
}: {
  ticket: JiraTrackingItem;
  projectId: number | null;
  onClose: () => void;
}) {
  const { data: comments = [], isLoading, error } = useJiraComments(projectId, ticket.jira_key);
  const addComment = useAddJiraComment(projectId, ticket.jira_key);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id?: string; name: string } | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body) return;

    await addComment.mutateAsync({
      text: body,
      // Solo enviamos la mención si el texto sigue empezando por ella.
      mentionId: replyTo && body.startsWith(`@[${replyTo.name}]`) ? replyTo.id : null,
    });

    setText('');
    setReplyTo(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40"
        role="presentation"
        onClick={onClose}
      />

      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-apple-lg">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-caption font-bold text-brand">{ticket.jira_key}</span>
                <Badge tone={STATUS_TONE(ticket.jira_status)}>{ticket.jira_status}</Badge>
                {ticket.jira_priority ? (
                  <span className="text-caption text-fg-subtle">{ticket.jira_priority}</span>
                ) : null}
              </div>
              <h2 className="mt-1 text-footnote font-semibold text-fg">{ticket.title}</h2>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={onClose}>
              <X />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Épica</p>
              <p className="text-fg-muted">
                {ticket.jira_epic_key} · {ticket.jira_epic_name}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Asignado</p>
              <p className="flex items-center gap-1.5 text-fg-muted">
                {ticket.jira_avatar ? (
                  <img src={ticket.jira_avatar} alt="" className="size-4 rounded-full" />
                ) : null}
                {ticket.jira_assignee}
              </p>
            </div>
          </div>

          <Button variant="primary" size="sm" className="mt-2 w-full" asChild>
            <a href={jiraIssueUrl(ticket.jira_key)} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Abrir en Jira
            </a>
          </Button>
        </header>

        <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
              Comentarios en Jira
            </p>
            <Badge tone="neutral">
              {isLoading ? '…' : `${comments.length}`}
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : error ? (
            <p className="rounded-md bg-fail-soft px-3 py-2 text-footnote text-fail">
              {(error as Error).message}
            </p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-footnote text-fg-subtle">
              Todavía no hay comentarios en este ticket.
            </p>
          ) : (
            <ul className="space-y-2">
              {comments.map((comment, index) => {
                const avatar =
                  comment.author?.avatarUrls?.['32x32'] ?? comment.author?.avatarUrls?.['48x48'];

                return (
                  <li
                    key={`${comment.id ?? index}-${comment.created}`}
                    className="rounded-lg border border-border bg-surface-2 p-3"
                  >
                    <div className="flex items-center gap-2">
                      {avatar ? (
                        <img src={avatar} alt="" className="size-5 rounded-full" />
                      ) : null}
                      <span className="text-caption font-semibold text-brand">
                        {comment.author?.displayName ?? '—'}
                      </span>
                      <span className="ml-auto text-caption text-fg-subtle">
                        {formatDate(comment.created)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        aria-label={`Responder a ${comment.author?.displayName ?? 'comentario'}`}
                        onClick={() => {
                          const name = comment.author?.displayName ?? 'Usuario';
                          setReplyTo({ id: comment.author?.accountId, name });
                          setText(`@[${name}] `);
                        }}
                      >
                        <CornerUpLeft />
                      </Button>
                    </div>

                    <p className={cn('mt-1 whitespace-pre-wrap text-footnote text-fg')}>
                      {adfToText(comment.body) || '—'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-border p-4">
          {replyTo ? (
            <p className="mb-1 flex items-center gap-1 text-caption text-brand">
              <CornerUpLeft className="size-3" />
              Respondiendo a {replyTo.name}
              <button
                type="button"
                className="ml-1 text-fg-subtle hover:text-fg"
                onClick={() => {
                  setReplyTo(null);
                  setText('');
                }}
              >
                (quitar)
              </button>
            </p>
          ) : null}

          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Escribí un comentario para Jira…"
            className="min-h-20"
            aria-label="Nuevo comentario"
          />

          <Button
            variant="primary"
            className="mt-2 w-full"
            onClick={send}
            loading={addComment.isPending}
            disabled={!text.trim()}
          >
            <Send />
            Enviar comentario
          </Button>
        </footer>
      </aside>
    </>
  );
}
