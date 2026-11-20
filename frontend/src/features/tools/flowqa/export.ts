import { computeEdgeGeometry, EDGE_COLORS, QA_STATUSES, type FlowState } from './model';

function escapeXml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapLines(text: string, maxChars: number, maxLines = 2) {
  if (!text) return [] as string[];
  const words = String(text).trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length <= maxChars) current = `${current} ${word}`.trim();
    else {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    trimmed[maxLines - 1] = `${trimmed[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
    return trimmed;
  }
  return lines;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(
  state: FlowState,
  meta: { name?: string; description?: string | null; entityType?: string | null; entityId?: number | null } = {},
) {
  const payload = {
    app: 'FlowQA Studio',
    version: 1,
    name: meta.name ?? 'Diagrama FlowQA',
    description: meta.description ?? null,
    entity_type: meta.entityType ?? null,
    entity_id: meta.entityId ?? null,
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    edges: state.edges,
    settings: state.settings,
  };
  const safeName = String(meta.name ?? 'flowqa')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'flowqa';
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${safeName}-${Date.now()}.json`,
  );
}

export function buildSvg(state: FlowState, isDark: boolean) {
  if (state.nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of state.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const pad = 56;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const ox = -minX + pad;
  const oy = -minY + pad;

  const bg = isDark ? '#020617' : '#ffffff';
  const nodeBg = isDark ? '#0f172a' : '#ffffff';
  const borderMuted = isDark ? '#334155' : '#e2e8f0';
  const titleColor = isDark ? '#f8fafc' : '#0f172a';
  const noteColor = isDark ? '#94a3b8' : '#64748b';
  const edgeDefault = isDark ? '#94a3b8' : '#64748b';
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<defs>`);
  for (const [key, cfg] of Object.entries(EDGE_COLORS)) {
    const fill = key === 'default' ? edgeDefault : cfg.hex;
    parts.push(
      `<marker id="arrow-${key}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="${fill}"/></marker>`,
    );
  }
  parts.push(
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="${isDark ? '0.45' : '0.08'}"/></filter>`,
  );
  parts.push(`</defs>`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`);

  for (const edge of state.edges) {
    const source = state.nodes.find((node) => node.id === edge.source);
    const target = state.nodes.find((node) => node.id === edge.target);
    if (!source || !target) continue;
    const from = { x: source.x + ox + source.width / 2, y: source.y + oy + source.height / 2 };
    const to = { x: target.x + ox + target.width / 2, y: target.y + oy + target.height / 2 };
    const sourcePoint =
      edge.sourcePort === 'top'
        ? { x: from.x, y: source.y + oy }
        : edge.sourcePort === 'bottom'
          ? { x: from.x, y: source.y + oy + source.height }
          : edge.sourcePort === 'left'
            ? { x: source.x + ox, y: from.y }
            : { x: source.x + ox + source.width, y: from.y };
    const targetPoint =
      edge.targetPort === 'top'
        ? { x: to.x, y: target.y + oy }
        : edge.targetPort === 'bottom'
          ? { x: to.x, y: target.y + oy + target.height }
          : edge.targetPort === 'left'
            ? { x: target.x + ox, y: to.y }
            : { x: target.x + ox + target.width, y: to.y };

    const { d, midX, midY } = computeEdgeGeometry(
      sourcePoint,
      edge.sourcePort,
      targetPoint,
      edge.targetPort,
    );
    const color = edge.color === 'default' ? edgeDefault : EDGE_COLORS[edge.color].hex;
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" ${edge.style === 'dashed' ? 'stroke-dasharray="6,5"' : ''} marker-end="url(#arrow-${edge.color})"/>`,
    );
    if (edge.label.trim()) {
      const label = edge.label.trim();
      const lw = Math.max(44, label.length * 6.9 + 18);
      parts.push(
        `<rect x="${midX - lw / 2}" y="${midY - 12}" width="${lw}" height="24" rx="7" fill="${nodeBg}" stroke="${color}" stroke-width="1.4"/>`,
      );
      parts.push(
        `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11.5" font-weight="600" fill="${titleColor}">${escapeXml(label)}</text>`,
      );
    }
  }

  for (const node of state.nodes) {
    const x = node.x + ox;
    const y = node.y + oy;
    const { width: w, height: h } = node;
    const qa = QA_STATUSES[node.qaStatus];
    const hasQa = node.qaStatus !== 'NONE';
    parts.push(`<g filter="url(#shadow)">`);

    if (node.type === 'start_end') {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${nodeBg}" stroke="${node.color}" stroke-width="2.2"/>`,
      );
      parts.push(`<circle cx="${x + 22}" cy="${y + h / 2}" r="4.5" fill="${node.color}"/>`);
      parts.push(
        `<text x="${x + 34}" y="${y + h / 2 + 4}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${titleColor}">${escapeXml(wrapLines(node.title, 22, 1)[0] || '')}</text>`,
      );
    } else if (node.type === 'decision') {
      parts.push(
        `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${nodeBg}" stroke="${node.color}" stroke-width="2.2" stroke-linejoin="round"/>`,
      );
      const lines = wrapLines(node.title, 16, 2);
      const startY = y + h / 2 - (lines.length - 1) * 7 + 4;
      lines.forEach((line, index) => {
        parts.push(
          `<text x="${x + w / 2}" y="${startY + index * 15}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" fill="${titleColor}">${escapeXml(line)}</text>`,
        );
      });
    } else if (node.type === 'data') {
      const skew = 16;
      parts.push(
        `<polygon points="${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}" fill="${nodeBg}" stroke="${node.color}" stroke-width="2.2" stroke-linejoin="round"/>`,
      );
      parts.push(
        `<text x="${x + 24}" y="${y + (node.note ? 32 : h / 2 + 4)}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${titleColor}">${escapeXml(wrapLines(node.title, 24, 1)[0] || '')}</text>`,
      );
      if (node.note) {
        wrapLines(node.note, 26, 2).forEach((line, index) => {
          parts.push(
            `<text x="${x + 24}" y="${y + 49 + index * 14}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="10.5" fill="${noteColor}">${escapeXml(line)}</text>`,
          );
        });
      }
    } else if (node.type === 'qa') {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${nodeBg}" stroke="${borderMuted}" stroke-width="1.2"/>`,
      );
      parts.push(`<path d="M ${x + 12} ${y} L ${x + w - 12} ${y} Q ${x + w} ${y} ${x + w} ${y + 6} L ${x} ${y + 6} Q ${x} ${y} ${x + 12} ${y} Z" fill="${node.color}"/>`);
      parts.push(
        `<text x="${x + 14}" y="${y + 24}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="9.5" font-weight="700" fill="${noteColor}">EVIDENCIA QA</text>`,
      );
      if (hasQa) {
        parts.push(
          `<text x="${x + w - 12}" y="${y + 23}" text-anchor="end" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="9" font-weight="700" fill="${node.color}">${qa.label}</text>`,
        );
      }
      parts.push(
        `<text x="${x + 14}" y="${y + 48}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${titleColor}">${escapeXml(wrapLines(node.title, 28, 1)[0] || '')}</text>`,
      );
      if (node.note) {
        wrapLines(node.note, 31, 2).forEach((line, index) => {
          parts.push(
            `<text x="${x + 14}" y="${y + 65 + index * 14}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="10.5" fill="${noteColor}">${escapeXml(line)}</text>`,
          );
        });
      }
    } else if (node.type === 'note') {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${node.color}" fill-opacity="${isDark ? '0.16' : '0.10'}" stroke="${node.color}" stroke-opacity="0.6" stroke-width="1.4" stroke-dasharray="5,4"/>`,
      );
      parts.push(
        `<text x="${x + 14}" y="${y + (node.note ? 28 : h / 2 + 4)}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" fill="${titleColor}">${escapeXml(wrapLines(node.title, 26, 1)[0] || '')}</text>`,
      );
      if (node.note) {
        wrapLines(node.note, 29, 3).forEach((line, index) => {
          parts.push(
            `<text x="${x + 14}" y="${y + 45 + index * 13}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="10.5" fill="${noteColor}">${escapeXml(line)}</text>`,
          );
        });
      }
    } else {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${nodeBg}" stroke="${borderMuted}" stroke-width="1.2"/>`,
      );
      parts.push(`<rect x="${x}" y="${y + 6}" width="5" height="${h - 12}" rx="2.5" fill="${node.color}"/>`);
      parts.push(
        `<text x="${x + 16}" y="${y + (node.note ? 30 : h / 2 + 4)}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${titleColor}">${escapeXml(wrapLines(node.title, 24, 1)[0] || '')}</text>`,
      );
      if (node.note) {
        wrapLines(node.note, 27, 2).forEach((line, index) => {
          parts.push(
            `<text x="${x + 16}" y="${y + 48 + index * 14}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="10.5" fill="${noteColor}">${escapeXml(line)}</text>`,
          );
        });
      }
    }

    if (hasQa && node.type !== 'qa') {
      parts.push(
        `<text x="${x + w - 8}" y="${y - 6}" text-anchor="end" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="9" font-weight="700" fill="${node.color}">${qa.label}</text>`,
      );
    }
    parts.push(`</g>`);
  }

  const date = new Date().toLocaleDateString('es-AR');
  parts.push(
    `<text x="${width - 14}" y="${height - 12}" text-anchor="end" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="10" fill="${noteColor}" opacity="0.65">FlowQA Studio • ${date}</text>`,
  );
  parts.push(`</svg>`);
  return { svg: parts.join('\n'), width, height };
}

export function renderSvgFile(state: FlowState, isDark: boolean, name = 'diagrama') {
  const res = buildSvg(state, isDark);
  if (!res) return null;
  const blob = new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' });
  return new File([blob], `${name}.svg`, { type: 'image/svg+xml' });
}

export async function renderPngFile(state: FlowState, isDark: boolean, name = 'diagrama') {
  const res = buildSvg(state, isDark);
  if (!res) return null;
  const scale = 2.5;
  const svgBlob = new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo cargar el SVG'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(res.width * scale);
    canvas.height = Math.round(res.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar el PNG');
    return new File([blob], `${name}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportSvg(state: FlowState, isDark: boolean) {
  const file = renderSvgFile(state, isDark, `flowqa-${Date.now()}`);
  if (!file) return false;
  downloadBlob(file, file.name);
  return true;
}

export async function exportPng(state: FlowState, isDark: boolean) {
  const file = await renderPngFile(state, isDark, `flowqa-evidencia-${Date.now()}`);
  if (!file) return false;
  downloadBlob(file, file.name);
  return true;
}

function sanitizeMermaid(text: string) {
  return String(text || '').replace(/"/g, "'").replace(/\n/g, ' ');
}

export function generateMermaid(state: FlowState) {
  const lines = [`flowchart ${state.settings.mermaidDir}`];
  const ids = new Map<string, string>();
  state.nodes.forEach((node, index) => {
    const id = `N${index + 1}`;
    ids.set(node.id, id);
    const qa = node.qaStatus !== 'NONE' ? `[${node.qaStatus}] ` : '';
    const note = node.note ? `<br/><small>${sanitizeMermaid(node.note)}</small>` : '';
    const label = `"${qa}${sanitizeMermaid(node.title)}${note}"`;
    let shape = `${id}[${label}]`;
    if (node.type === 'start_end') shape = `${id}([${label}])`;
    else if (node.type === 'decision') shape = `${id}{${label}}`;
    else if (node.type === 'data') shape = `${id}[/${label}/]`;
    else if (node.type === 'note') shape = `${id}>${label}]`;
    lines.push(`    ${shape}`);
  });
  if (state.edges.length) lines.push('');
  for (const edge of state.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) continue;
    const arrow = edge.style === 'dashed' ? '-.->' : '-->';
    lines.push(
      edge.label.trim()
        ? `    ${source} ${arrow}|"${sanitizeMermaid(edge.label.trim())}"| ${target}`
        : `    ${source} ${arrow} ${target}`,
    );
  }
  const groups: Record<string, string[]> = { PASS: [], FAIL: [], BLOCKED: [], PENDING: [] };
  state.nodes.forEach((node) => {
    if (groups[node.qaStatus]) groups[node.qaStatus].push(ids.get(node.id) as string);
  });
  if (Object.values(groups).some((group) => group.length)) {
    lines.push('');
    lines.push('    classDef qaPass fill:#ecfdf5,stroke:#10b981,stroke-width:2px,color:#065f46');
    lines.push('    classDef qaFail fill:#fef2f2,stroke:#ef4444,stroke-width:2px,color:#991b1b');
    lines.push('    classDef qaBlocked fill:#fff7ed,stroke:#f97316,stroke-width:2px,color:#9a3412');
    lines.push('    classDef qaPending fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e40af');
    if (groups.PASS.length) lines.push(`    class ${groups.PASS.join(',')} qaPass`);
    if (groups.FAIL.length) lines.push(`    class ${groups.FAIL.join(',')} qaFail`);
    if (groups.BLOCKED.length) lines.push(`    class ${groups.BLOCKED.join(',')} qaBlocked`);
    if (groups.PENDING.length) lines.push(`    class ${groups.PENDING.join(',')} qaPending`);
  }
  return lines.join('\n');
}
