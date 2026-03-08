DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'numeros_rifa'
      AND column_name = 'atualizado_em'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'numeros_rifa'
      AND column_name = 'atualizada_em'
  ) THEN
    ALTER TABLE numeros_rifa RENAME COLUMN atualizado_em TO atualizada_em;
  END IF;
END $$;
