-- O webhook usa a chave secreta (papel service_role) e chama pela API, que só
-- alcança funções do schema public. Esta é a porta: nada de anon nem de usuário
-- logado, só o servidor.
create or replace function public.aplicar_status_de_cobranca(
  p_assinatura text, p_status text
) returns uuid
language sql security definer set search_path = ''
as $$
  select private.aplicar_status_de_cobranca(p_assinatura, p_status);
$$;

revoke execute on function public.aplicar_status_de_cobranca(text, text) from public, anon, authenticated;
grant execute on function public.aplicar_status_de_cobranca(text, text) to service_role;
