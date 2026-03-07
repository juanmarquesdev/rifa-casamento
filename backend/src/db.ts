import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidas no arquivo .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Interface de tipos para as tabelas
export interface Rifa {
  id: string;
  descricao: string;
  valor_premio: number;
  valor_numero: number;
  lucro_desejado: number;
  faturamento_alvo: number;
  quantidade_numeros: number;
  data_sorteio: string;
  status: string;
  criada_em: string;
  atualizada_em: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  criada_em: string;
  atualizada_em: string;
}

export interface NumeroRifa {
  id: string;
  rifa_id: string;
  numero: string;
  pessoa_id: string | null;
  pago: boolean;
  valor_pago: number | null;
  vendido_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Sorteio {
  id: string;
  rifa_id: string;
  numero_rifa_id: string;
  numero: string;
  pessoa_id: string | null;
  vencedor_nome: string;
  vencedor_telefone: string;
  criada_em: string;
}
