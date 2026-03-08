-- Tabela de rifas
CREATE TABLE rifas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao TEXT NOT NULL,
    foto_premio TEXT,
    valor_premio DECIMAL(10, 2) NOT NULL,
    valor_numero DECIMAL(10, 2) NOT NULL,
    lucro_desejado DECIMAL(10, 2) NOT NULL DEFAULT 0,
    faturamento_alvo DECIMAL(10, 2) NOT NULL DEFAULT 0,
    quantidade_numeros INTEGER NOT NULL DEFAULT 0,
    data_sorteio TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativa',
    criada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    atualizada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tabela de pessoas
CREATE TABLE pessoas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    criada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    atualizada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(nome, telefone)
);

-- Tabela de números da rifa
CREATE TABLE numeros_rifa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rifa_id UUID NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
    pago BOOLEAN NOT NULL DEFAULT false,
    valor_pago DECIMAL(10, 2),
    vendido_em TIMESTAMP WITH TIME ZONE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(rifa_id, numero)
);

-- Tabela de sorteios
CREATE TABLE sorteios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rifa_id UUID NOT NULL UNIQUE REFERENCES rifas(id) ON DELETE CASCADE,
    numero_rifa_id UUID NOT NULL REFERENCES numeros_rifa(id) ON DELETE RESTRICT,
    numero TEXT NOT NULL,
    pessoa_id UUID REFERENCES pessoas(id) ON DELETE
    SET
        NULL,
        vencedor_nome TEXT NOT NULL,
        vencedor_telefone TEXT NOT NULL,
        criada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX idx_numeros_rifa_rifa ON numeros_rifa(rifa_id);

CREATE INDEX idx_numeros_rifa_pessoa ON numeros_rifa(pessoa_id);

CREATE INDEX idx_numeros_rifa_numero ON numeros_rifa(rifa_id, numero);

CREATE INDEX idx_rifas_status ON rifas(status);

CREATE INDEX idx_pessoas_nome ON pessoas(nome);

-- Trigger para atualizar atualizada_em automaticamente em rifas
CREATE
OR REPLACE FUNCTION update_modified_column() RETURNS TRIGGER AS $ $ BEGIN NEW.atualizada_em = NOW();

RETURN NEW;

END;

$ $ language 'plpgsql';

CREATE TRIGGER update_rifas_modtime BEFORE
UPDATE
    ON rifas FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_pessoas_modtime BEFORE
UPDATE
    ON pessoas FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_numeros_rifa_modtime BEFORE
UPDATE
    ON numeros_rifa FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Políticas de segurança RLS (Row Level Security)
ALTER TABLE
    rifas ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    pessoas ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    numeros_rifa ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    sorteios ENABLE ROW LEVEL SECURITY;

-- Política para permitir acesso total (ajuste conforme necessário)
CREATE POLICY "Permitir acesso público a rifas" ON rifas FOR ALL USING (true);

CREATE POLICY "Permitir acesso público a pessoas" ON pessoas FOR ALL USING (true);

CREATE POLICY "Permitir acesso público a numeros_rifa" ON numeros_rifa FOR ALL USING (true);

CREATE POLICY "Permitir acesso público a sorteios" ON sorteios FOR ALL USING (true);