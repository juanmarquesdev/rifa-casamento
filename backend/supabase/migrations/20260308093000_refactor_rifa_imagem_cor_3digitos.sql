ALTER TABLE rifas
  ADD COLUMN imagem_rifa TEXT,
  ADD COLUMN cor_rifa TEXT;

UPDATE rifas
SET imagem_rifa = foto_premio
WHERE imagem_rifa IS NULL
  AND foto_premio IS NOT NULL;

UPDATE rifas
SET cor_rifa = '#C8D2C6'
WHERE cor_rifa IS NULL
   OR trim(cor_rifa) = '';

ALTER TABLE rifas
  ALTER COLUMN cor_rifa SET DEFAULT '#C8D2C6';

ALTER TABLE rifas
  ALTER COLUMN cor_rifa SET NOT NULL;

ALTER TABLE rifas
  DROP COLUMN foto_premio;
