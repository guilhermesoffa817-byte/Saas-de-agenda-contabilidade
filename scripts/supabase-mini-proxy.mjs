#!/usr/bin/env node
/**
 * O "Kong" do mini-Supabase de testes (scripts/supabase-mini.sh): um proxy HTTP
 * que imita as rotas do gateway do Supabase.
 *
 *   /auth/v1/*  → GoTrue    (GOTRUE_URL,    padrão http://127.0.0.1:9999)
 *   /rest/v1/*  → PostgREST (POSTGREST_URL, padrão http://127.0.0.1:3001)
 *   o resto     → 404 (inclusive /storage/v1, que não existe aqui)
 *
 * Repassa método, corpo e cabeçalhos (apikey, Authorization, Prefer...). Como o
 * Kong do Supabase, quando o pedido não traz Authorization usa a apikey como
 * Bearer, para o PostgREST saber o papel (anon ou service_role).
 *
 *   PORTA=54321 node scripts/supabase-mini-proxy.mjs
 */
import http from "node:http";

const PORTA = Number(process.env.PORTA ?? 54321);
const HOST = process.env.HOST ?? "127.0.0.1";
const ROTAS = [
  { prefixo: "/auth/v1", destino: new URL(process.env.GOTRUE_URL ?? "http://127.0.0.1:9999") },
  { prefixo: "/rest/v1", destino: new URL(process.env.POSTGREST_URL ?? "http://127.0.0.1:3001") },
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-allow-headers":
    "authorization,apikey,content-type,prefer,range,x-client-info,accept-profile,content-profile,x-supabase-api-version,x-retry-count",
  "access-control-expose-headers": "content-range,range,x-total-count,sb-gateway-version",
  "access-control-max-age": "86400",
};

function responder(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(corpo));
}

const servidor = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://proxy");
  if (url.pathname === "/__saude") return responder(res, 200, { ok: true });

  const rota = ROTAS.find((r) => url.pathname === r.prefixo || url.pathname.startsWith(`${r.prefixo}/`));
  if (!rota) return responder(res, 404, { message: "no Route matched with those values" });

  const caminho = url.pathname.slice(rota.prefixo.length) || "/";
  const cabecalhos = { ...req.headers };
  delete cabecalhos.host;
  delete cabecalhos.connection;
  if (!cabecalhos.authorization && typeof cabecalhos.apikey === "string") {
    cabecalhos.authorization = `Bearer ${cabecalhos.apikey}`;
  }
  // Para o GoTrue montar links e cookies com o endereço público, como atrás do Kong.
  cabecalhos["x-forwarded-host"] = req.headers.host ?? `${HOST}:${PORTA}`;
  cabecalhos["x-forwarded-proto"] = "http";
  cabecalhos["x-forwarded-prefix"] = rota.prefixo;

  const pedido = http.request(
    {
      protocol: rota.destino.protocol,
      hostname: rota.destino.hostname,
      port: rota.destino.port,
      method: req.method,
      path: `${caminho}${url.search}`,
      headers: cabecalhos,
    },
    (resposta) => {
      const saida = { ...resposta.headers };
      for (const [k, v] of Object.entries(CORS)) if (!(k in saida)) saida[k] = v;
      res.writeHead(resposta.statusCode ?? 502, saida);
      resposta.pipe(res);
    },
  );
  pedido.on("error", (erro) => {
    if (!res.headersSent) responder(res, 502, { message: `destino fora do ar: ${erro.message}` });
    else res.destroy(erro);
  });
  req.pipe(pedido);
});

servidor.listen(PORTA, HOST, () => {
  console.log(`proxy do mini-Supabase em http://${HOST}:${PORTA}`);
});
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => servidor.close(() => process.exit(0)));
