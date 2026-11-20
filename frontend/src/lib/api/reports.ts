/**
 * Reportes HTML generados por el backend.
 * Las URLs se abren en una pestaña nueva con window.open.
 */
export const reportsApi = {
  /** Último estado guardado por TC de una ejecución/sesión (activa o final). */
  currentStateUrl: (runId: number) => `/api/reports/${runId}/current-state`,

  /** Estado de entrega por ciclo, incluyendo cadena de retest. */
  deliveryUrl: (runId: number) => `/api/reports/${runId}/delivery`,

  /** Auditoría detallada del ciclo. */
  auditUrl: (runId: number) => `/api/reports/${runId}`,
};
