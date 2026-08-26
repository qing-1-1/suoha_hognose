-- Resolve user-confirmed stock genotypes.
-- S21 (female): Albino + Arctic + Conda + het Lavender + Swiss Chocolate.
-- S22 (male):   Albino + Conda + het Lavender + Swiss Chocolate; no Arctic.
-- S31: Super Arctic + Lavender; parenthesized Conda removed.

begin;

update public.snakes
set gene_text = case id
  when 'S21' then '白化北极康隐薰巧'
  when 'S22' then '白化康隐薰巧'
  when 'S31' then '超北薰衣草'
end
where id in ('S21', 'S22', 'S31');

insert into public.snake_genes (snake_id, gene_id, state, probability, source, notes)
values
  ('S21', 'albino',           'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S21', 'arctic',           'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S21', 'conda',            'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S21', 'lavender',         'het',    1, 'manual', '2026-08 user-confirmed genotype'),
  ('S21', 'swiss_chocolate', 'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S22', 'albino',           'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S22', 'conda',            'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S22', 'lavender',         'het',    1, 'manual', '2026-08 user-confirmed genotype'),
  ('S22', 'swiss_chocolate', 'visual', 1, 'manual', '2026-08 user-confirmed genotype'),
  ('S31', 'arctic',           'super',  1, 'manual', '2026-08 user-confirmed genotype'),
  ('S31', 'lavender',         'visual', 1, 'manual', '2026-08 user-confirmed genotype')
on conflict (snake_id, gene_id) do update set
  state = excluded.state,
  probability = excluded.probability,
  source = excluded.source,
  notes = excluded.notes;

-- Explicit user confirmation: S22 has no Arctic; S31 has no Conda.
delete from public.snake_genes
where (snake_id = 'S22' and gene_id = 'arctic')
   or (snake_id = 'S31' and gene_id = 'conda');

commit;
