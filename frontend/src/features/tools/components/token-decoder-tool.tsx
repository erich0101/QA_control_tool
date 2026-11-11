import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/features/dashboard/components/charts';
import { JsonView } from './json-view';
import {
  charBreakdown,
  describeClaims,
  detectTokenType,
  entropyLabel,
  generateSampleJwt,
  parseJwt,
  shannonEntropy,
  verifyJwtSignature,
  type ClaimRow,
  type VerifyResult,
} from '../lib/token';

const TYPE_LABEL: Record<string, string> = {
  empty: 'Sin token',
  jwt: 'JWT',
  hash: 'Hash',
  uuid: 'UUID',
  base64: 'Base64 legible',
  hex: 'Hexadecimal',
  opaque: 'Token opaco',
};

const CLAIM_TONE: Record<string, 'ok' | 'fail' | 'warn'> = {
  valid: 'ok',
  expired: 'fail',
  pending: 'warn',
};

export function TokenDecoderTool() {
  const [input, setInput] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const detection = useMemo(() => detectTokenType(input), [input]);
  const parsed = useMemo(() => (detection.type === 'jwt' ? parseJwt(input) : null), [detection, input]);
  const jwt = parsed?.ok ? parsed.value : null;

  const claims = useMemo<ClaimRow[]>(
    () => (jwt ? describeClaims(jwt.payload) : []),
    [jwt],
  );

  const entropy = useMemo(() => shannonEntropy(input.trim()), [input]);
  const breakdown = useMemo(() => charBreakdown(input.trim()), [input]);

  // Verificación con debounce: no recalcular en cada tecla.
  useEffect(() => {
    let cancelled = false;

    if (!jwt || !secret.trim()) {
      setVerify(null);
      setVerifying(false);
      return;
    }

    setVerifying(true);
    const timer = window.setTimeout(async () => {
      const result = await verifyJwtSignature(
        jwt.header,
        jwt.headerB64,
        jwt.payloadB64,
        jwt.signatureB64,
        secret,
      );
      if (!cancelled) {
        setVerify(result);
        setVerifying(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jwt, secret]);

  const loadSample = async () => {
    const sample = await generateSampleJwt();
    setInput(sample.token);
    setSecret(sample.secret);
    setShowSecret(true);
    toast.success('Token de ejemplo cargado (secret: your-256-bit-secret)');
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const clear = () => {
    setInput('');
    setSecret('');
    setVerify(null);
  };

  const formula = `H = ${entropy.toFixed(2)} bits/carácter · ${(entropy * breakdown.total).toFixed(0)} bits totales`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-title3 font-semibold text-fg">Token Decoder</h2>
        <p className="text-footnote text-fg-muted">
          Decodificá JWT, hashes, UUID, Base64 y tokens opacos. La verificación de firma es local.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={detection.type === 'empty' ? 'neutral' : 'brand'}>
          {TYPE_LABEL[detection.type]}
          {detection.hashKind ? ` · ${detection.hashKind}` : ''}
        </Badge>
        {detection.length > 0 ? (
          <span className="text-caption text-fg-subtle">{detection.length} caracteres</span>
        ) : null}

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void loadSample()}>
            <Sparkles />
            Token de ejemplo
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} disabled={!input}>
            <Trash2 />
            Limpiar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Pegá un JWT, hash, UUID, Base64 o token opaco…"
            aria-label="Token a decodificar"
            spellCheck={false}
            className="scrollbar-apple min-h-28 w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-footnote text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand"
          />
        </CardContent>
      </Card>

      {detection.type === 'empty' ? (
        <EmptyState
          icon={<KeyRound />}
          title="Pegá un token para analizarlo"
          description="Si no tenés uno a mano, usá 'Token de ejemplo' para ver un JWT firmado con HS256."
        />
      ) : (
        <>
          {detection.type === 'jwt' ? (
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
                  Header
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar header"
                  disabled={!jwt}
                  onClick={() =>
                    jwt ? void copy(JSON.stringify(jwt.header, null, 2), 'Header') : undefined
                  }
                >
                  <Copy />
                </Button>
              </CardHeader>
              <CardContent>
                {jwt ? (
                  <JsonView value={jwt.header} />
                ) : (
                  <p className="text-footnote text-fg-subtle">
                    {parsed && !parsed.ok
                      ? parsed.error
                      : 'Este token no tiene header: no es un JWT.'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
                  Payload
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar payload"
                  disabled={!jwt}
                  onClick={() =>
                    jwt ? void copy(JSON.stringify(jwt.payload, null, 2), 'Payload') : undefined
                  }
                >
                  <Copy />
                </Button>
              </CardHeader>
              <CardContent>
                {jwt ? (
                  <JsonView value={jwt.payload} />
                ) : (
                  <p className="text-footnote text-fg-subtle">—</p>
                )}
              </CardContent>
            </Card>
            </div>
          ) : null}

          {jwt ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
                    Claims ({claims.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full border-collapse text-footnote">
                      <thead>
                        <tr className="border-b border-border bg-fill-soft text-caption uppercase tracking-wide text-fg-subtle">
                          <th className="w-40 px-3 py-2 text-left font-semibold">Claim</th>
                          <th className="px-3 py-2 text-left font-semibold">Valor</th>
                          <th className="w-24 px-3 py-2 text-right font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claims.map((claim) => (
                          <tr key={claim.key} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 align-top">
                              <span className="font-mono text-caption font-semibold text-brand">
                                {claim.key}
                              </span>
                              <p className="text-[10px] text-fg-subtle">{claim.label}</p>
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              <p className="break-all text-fg">{claim.display}</p>
                              {claim.description ? (
                                <p className="text-[10px] text-fg-subtle">{claim.description}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-right align-top">
                              {claim.status ? (
                                <Badge tone={CLAIM_TONE[claim.status]}>
                                  {claim.status === 'valid'
                                    ? 'vigente'
                                    : claim.status === 'expired'
                                      ? 'vencido'
                                      : 'no válido aún'}
                                </Badge>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
                    Verificación de firma
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field
                      label="Secret (HMAC)"
                      htmlFor="token-secret"
                      className="min-w-64 flex-1"
                      hint="Se usa solo en tu navegador; no se envía al servidor."
                    >
                      <div className="relative">
                        <Input
                          id="token-secret"
                          type={showSecret ? 'text' : 'password'}
                          value={secret}
                          onChange={(event) => setSecret(event.target.value)}
                          placeholder="your-256-bit-secret"
                          autoComplete="off"
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret((value) => !value)}
                          aria-label={showSecret ? 'Ocultar secret' : 'Mostrar secret'}
                          className="absolute inset-y-0 right-2 flex items-center text-fg-subtle hover:text-fg"
                        >
                          {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </Field>

                    <div className="pb-5">
                      <Badge tone="neutral">alg: {String(jwt.header.alg ?? '—')}</Badge>
                    </div>
                  </div>

                  <div className="min-h-9">
                    {verifying ? (
                      <p className="text-footnote text-fg-subtle">Verificando…</p>
                    ) : !verify ? (
                      <p className="text-footnote text-fg-subtle">
                        Ingresá el secret para verificar la firma.
                      </p>
                    ) : verify.status === 'valid' ? (
                      <p className="flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-footnote font-semibold text-ok">
                        <ShieldCheck className="size-4" />
                        Firma válida (Signature Verified)
                      </p>
                    ) : verify.status === 'invalid' ? (
                      <p className="flex items-center gap-2 rounded-md bg-fail-soft px-3 py-2 text-footnote font-semibold text-fail">
                        <ShieldAlert className="size-4" />
                        Firma inválida (Signature Invalid)
                      </p>
                    ) : verify.status === 'unsupported' ? (
                      <p className="rounded-md bg-warn-soft px-3 py-2 text-footnote text-warn">
                        {verify.message}
                      </p>
                    ) : (
                      <p className="rounded-md bg-fail-soft px-3 py-2 text-footnote text-fail">
                        {verify.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t border-border pt-2 text-caption text-fg-subtle">
                    <BadgeCheck className="size-3.5" />
                    Se recalculan HS256, HS384 y HS512 según el `alg` del header.
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
                  Análisis del token
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-fill-soft px-3 py-2">
                    <p className="text-caption text-fg-subtle">Tipo</p>
                    <p className="font-semibold text-fg">
                      {TYPE_LABEL[detection.type]}
                      {detection.hashKind ? ` ${detection.hashKind}` : ''}
                    </p>
                  </div>
                  <div className="rounded-md bg-fill-soft px-3 py-2">
                    <p className="text-caption text-fg-subtle">Longitud</p>
                    <p className="font-semibold text-fg">{detection.length} caracteres</p>
                  </div>
                  <div className="rounded-md bg-fill-soft px-3 py-2">
                    <p className="text-caption text-fg-subtle">Entropía</p>
                    <p className="font-semibold text-fg">{entropy.toFixed(2)} bits/carácter</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-caption text-fg-subtle">
                    <span>{formula}</span>
                    <Badge tone={entropyLabel(entropy).tone}>{entropyLabel(entropy).label}</Badge>
                  </div>
                  <ProgressBar
                    value={(entropy / 6) * 100}
                    tone={entropyLabel(entropy).tone === 'ok' ? 'ok' : entropyLabel(entropy).tone === 'warn' ? 'warn' : 'fail'}
                  />
                </div>

                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                    Composición
                  </p>
                  {(
                    [
                      ['Mayúsculas', breakdown.upper],
                      ['Minúsculas', breakdown.lower],
                      ['Dígitos', breakdown.digit],
                      ['Símbolos', breakdown.symbol],
                      ['Otros', breakdown.other],
                    ] as const
                  ).map(([label, count]) => (
                    <div key={label} className="flex items-center gap-2 text-caption">
                      <span className="w-24 text-fg-muted">{label}</span>
                      <ProgressBar
                        value={breakdown.total > 0 ? (count / breakdown.total) * 100 : 0}
                        tone="brand"
                        className="flex-1"
                      />
                      <span className="w-10 text-right tabular-nums text-fg">{count}</span>
                    </div>
                  ))}
                </div>

                {detection.decodedPreview ? (
                  <div className="border-t border-border pt-3">
                    <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                      Se decodifica a texto
                    </p>
                    <pre className="scrollbar-apple mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-caption text-fg-muted">
                      {detection.decodedPreview}
                    </pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
