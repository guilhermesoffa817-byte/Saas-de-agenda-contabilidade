/**
 * O PostgREST devolve no máximo mil linhas por resposta (`max_rows` no
 * supabase/config.toml, e o mesmo padrão no Supabase hospedado) e corta o resto
 * sem erro. Toda soma de lançamentos pede de página em página até acabar.
 *
 * A consulta passada precisa ter `order` estável (por exemplo `.order("id")`),
 * senão uma linha pode cair em duas páginas ou em nenhuma.
 */
export const TAMANHO_DA_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function lerTodasAsPaginas<T>(
  pagina: (de: number, ate: number) => Pagina<T>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw new Error(`Não foi possível ler os lançamentos: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_DA_PAGINA) return linhas;
  }
}
