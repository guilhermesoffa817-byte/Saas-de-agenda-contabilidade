/**
 * Cabeçalhos de segurança.
 *
 * A CSP usa nonce por requisição com `strict-dynamic`, que é o jeito que o
 * Next.js recomenda: o script que o framework injeta carrega com o nonce, e
 * `strict-dynamic` deixa esse script carregar os pedaços seguintes sem precisar
 * liberar o domínio inteiro.
 */

/** Cabeçalhos que não dependem de nonce nem de requisição. */
export const CABECALHOS_FIXOS = [
  // Um ano de HTTPS obrigatório, incluindo subdomínios.
  { chave: "Strict-Transport-Security", valor: "max-age=31536000; includeSubDomains" },
  { chave: "X-Content-Type-Options", valor: "nosniff" },
  { chave: "X-Frame-Options", valor: "DENY" },
  { chave: "Referrer-Policy", valor: "strict-origin-when-cross-origin" },
  // Nada de câmera, microfone, localização ou pagamento: o Alicerce não usa.
  {
    chave: "Permissions-Policy",
    valor: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  { chave: "X-DNS-Prefetch-Control", valor: "off" },
] as const;

/** Páginas geradas na build, onde não existe nonce por requisição. */
const CAMINHOS_DINAMICOS = ["/app", "/contador", "/comecar", "/agendar", "/convite", "/entrar", "/cadastro", "/recuperar-senha", "/nova-senha", "/auth", "/api"];

/**
 * Diz se a rota é renderizada a cada visita. Só nessas o Next consegue carimbar
 * o nonce nos scripts — numa página estática o HTML foi escrito na build, muito
 * antes do nonce existir.
 */
export function rotaDinamica(caminho: string) {
  return CAMINHOS_DINAMICOS.some(
    (inicio) => caminho === inicio || caminho.startsWith(`${inicio}/`),
  );
}

/**
 * Monta a CSP da requisição. Em desenvolvimento o Turbopack precisa de `eval`.
 *
 * Nas páginas estáticas (a página de vendas e as de conteúdo) não dá para usar
 * nonce, então o script inline do Next entra por `'unsafe-inline'`. Vale a pena
 * saber o que isso custa: essas páginas não têm formulário, não leem dado de
 * usuário e não montam HTML a partir de texto de ninguém — a superfície de XSS
 * ali é o próprio código. Onde existe dado de gente de verdade (sistema, portal
 * do contador, telas de conta) a rota é dinâmica e a CSP é a estrita, com nonce.
 */
export function montarCSP(params: {
  nonce: string;
  desenvolvimento: boolean;
  dinamica?: boolean;
}) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const origemDoSupabase = origemDe(supabase);
  // O Realtime e o Storage do Supabase falam pelo mesmo domínio, via wss.
  const websocket = origemDoSupabase ? origemDoSupabase.replace(/^https:/, "wss:") : "";

  const dinamica = params.dinamica ?? true;

  const script = dinamica
    ? [
        "'self'",
        `'nonce-${params.nonce}'`,
        "'strict-dynamic'",
        params.desenvolvimento ? "'unsafe-eval'" : "",
      ].filter(Boolean)
    : ["'self'", "'unsafe-inline'", params.desenvolvimento ? "'unsafe-eval'" : ""].filter(Boolean);

  const conexao = [
    "'self'",
    origemDoSupabase,
    websocket,
    // Turnstile e o checkout do Asaas, quando configurados.
    "https://challenges.cloudflare.com",
    params.desenvolvimento ? "ws://localhost:*" : "",
  ].filter(Boolean);

  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    // O Next injeta <style> em tempo de execução; sem 'unsafe-inline' a página
    // aparece sem estilo. É o único ponto solto, e vale só para estilo.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": conexao,
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const texto = Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
    .join("; ");

  return params.desenvolvimento ? texto : `${texto}; upgrade-insecure-requests`;
}

function origemDe(url: string) {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}
