import type { EquipeParaOContador } from "@/app/(app)/app/equipe/dados";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROTULO_AUSENCIA,
  ROTULO_PAGAMENTO,
  VINCULOS,
  diasNoPeriodo,
  formatarDia,
  nomeDoMes,
  resumirRemuneracao,
} from "@/lib/equipe";
import { formatarBRL } from "@/lib/money";

/**
 * Equipe do cliente no portal do contador, só leitura: o necessário para a
 * folha (nome, cargo, vínculo, datas, combinado, ausências e pagamentos).
 * CPF, Pix, telefone, e-mail e observações ficam só com o dono.
 */
export function EquipeDoCliente({
  equipe,
  periodo,
}: {
  equipe: EquipeParaOContador;
  /** "setembro de 2026" ou "01/09/2026 a 30/09/2026". */
  periodo: string;
}) {
  const nomePorId = new Map(equipe.colaboradores.map((c) => [c.id, c.nome]));
  const nome = (id: string) => nomePorId.get(id) ?? "Ex-colaborador";
  const totalPago = equipe.pagamentos.reduce((soma, p) => soma + p.valorCents, 0);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-equipe-do-cliente">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-equipe-do-cliente" className="text-lg font-semibold">
          Equipe
        </h2>
        <p className="text-sm text-muted-foreground">
          Somente leitura, como o cliente registrou. Período: {periodo}. Documento, Pix e contato
          da equipe ficam só com o dono.
        </p>
      </div>

      {equipe.colaboradores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          O cliente não tem equipe cadastrada neste período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Último dia</TableHead>
                <TableHead>Combinado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipe.colaboradores.map((colaborador) => (
                <TableRow key={colaborador.id}>
                  <TableCell>
                    <span className="block font-medium">{colaborador.nome}</span>
                    {colaborador.cargo ? (
                      <span className="text-xs text-muted-foreground">{colaborador.cargo}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{VINCULOS[colaborador.contrato].curto}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatarDia(colaborador.inicio)}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {colaborador.fim ? formatarDia(colaborador.fim) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {colaborador.removido
                      ? "—"
                      : resumirRemuneracao(colaborador.contrato, colaborador)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Ausências no período</h3>
          {equipe.ausencias.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma ausência registrada.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipe.ausencias.map((ausencia) => (
                    <TableRow key={ausencia.id}>
                      <TableCell className="font-medium">{nome(ausencia.colaboradorId)}</TableCell>
                      <TableCell>{ROTULO_AUSENCIA[ausencia.tipo]}</TableCell>
                      <TableCell className="font-mono text-xs tabular whitespace-nowrap">
                        {formatarDia(ausencia.inicio)} a {formatarDia(ausencia.fim)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {diasNoPeriodo(ausencia.inicio, ausencia.fim)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Pagamentos com referência no período</h3>
          {equipe.pagamentos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum pagamento registrado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipe.pagamentos.map((pagamento) => (
                    <TableRow key={pagamento.id}>
                      <TableCell className="font-medium">{nome(pagamento.colaboradorId)}</TableCell>
                      <TableCell>{ROTULO_PAGAMENTO[pagamento.tipo]}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {nomeDoMes(pagamento.mesDeReferencia)}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular">
                        {formatarDia(pagamento.pagoEm)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular whitespace-nowrap">
                        {formatarBRL(pagamento.valorCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Total pago</TableCell>
                    <TableCell className="text-right font-mono tabular whitespace-nowrap">
                      {formatarBRL(totalPago)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O Bossa não calcula folha: os valores são o que o cliente pagou e registrou.
      </p>
    </section>
  );
}
