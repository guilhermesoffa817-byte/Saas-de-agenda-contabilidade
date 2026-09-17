"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { atualizarDadosDaEmpresa } from "./acoes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FUSOS_BRASIL } from "@/lib/dates";
import { REGIMES, SEGMENTOS } from "@/lib/segmentos";
import { esquemaDadosDaEmpresa, type DadosDaEmpresaInput } from "@/lib/validacao/empresa";

export function FormularioNegocio({
  empresaId,
  valores,
}: {
  empresaId: string;
  valores: DadosDaEmpresaInput;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const form = useForm<DadosDaEmpresaInput>({
    resolver: zodResolver(esquemaDadosDaEmpresa),
    defaultValues: valores,
  });

  function enviar(dados: DadosDaEmpresaInput) {
    setErro(null);
    iniciar(async () => {
      const resposta = await atualizarDadosDaEmpresa(empresaId, dados);
      if (resposta.erro) setErro(resposta.erro);
      if (resposta.aviso) toast.success(resposta.aviso);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="flex max-w-2xl flex-col gap-6" noValidate>
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do negócio</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link de agendamento</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono" />
              </FormControl>
              <FormDescription>
                O endereço fica assim: /agendar/{field.value || "seu-negocio"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="segmento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de negócio</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SEGMENTOS.map((item) => (
                      <SelectItem key={item.valor} value={item.valor}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="regime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Como você trabalha</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {REGIMES.map((item) => (
                      <SelectItem key={item.valor} value={item.valor}>
                        {item.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Muda os relatórios preparados para o contador.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="fuso"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fuso horário</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {FUSOS_BRASIL.map((item) => (
                    <SelectItem key={item.valor} value={item.valor}>
                      {item.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="documento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF ou CNPJ</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} inputMode="numeric" className="font-mono tabular" />
                </FormControl>
                <FormDescription>Necessário para recibos e notas.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="abertura"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de abertura</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="date" />
                </FormControl>
                <FormDescription>Usada no limite proporcional do MEI.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-[1fr_120px]">
          <FormField
            control={form.control}
            name="cidade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estado"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} maxLength={2} placeholder="MT" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="chavePix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chave Pix</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
              </FormControl>
              <FormDescription>
                Usada para gerar o Pix copia e cola nos recebimentos.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={salvando} className="w-fit">
          {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Salvar alterações
        </Button>
      </form>
    </Form>
  );
}
