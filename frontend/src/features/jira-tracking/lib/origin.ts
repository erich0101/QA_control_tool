import type { JiraTrackingItem } from '@/lib/api/types';

/** Datos de trazabilidad local de un ticket de Jira. */
export function jiraTrackingOrigin(ticket: JiraTrackingItem) {
  const isHallazgo = ticket.origin === 'hallazgo';
  return {
    isHallazgo,
    label: `${isHallazgo ? 'Hallazgo' : 'Bug'} #${ticket.id}`,
    tcKey: ticket.tc_key || ticket.origin_tc_key || null,
    tcTitle: ticket.tc_title || ticket.origin_tc_title || null,
  };
}

/** Ruta local para abrir el origen del ticket, si existe una vista directa. */
export function jiraTrackingOriginHref(ticket: JiraTrackingItem) {
  if (ticket.origin === 'hallazgo') return `/app/hallazgos?id=${ticket.id}`;
  const runId = ticket.run_id ?? null;
  return ticket.run_type === 'EXPLORATORY' && runId
    ? `/app/exploratoria?run=${runId}`
    : null;
}

/** Resumen de la sesión/ciclo donde se reportó el error. */
export function jiraTrackingRunLabel(ticket: JiraTrackingItem) {
  const runId = ticket.run_id ?? ticket.origin_run_id ?? null;
  if (!runId) return null;
  const type = ticket.run_type === 'EXPLORATORY' ? 'Exploratoria' : ticket.run_type ?? 'Ciclo';
  const name = ticket.run_name ? ` · ${ticket.run_name}` : '';
  return `#${runId} · ${type}${name}`;
}
