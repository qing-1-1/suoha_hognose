-- Genetic metadata required by the client-side Mendelian probability engine.
-- Run in Supabase SQL Editor if this knowledge has not already been applied.

begin;

update public.genes
set inheritance_type = 'incomplete_dominant',
    locus = 'skullface',
    description = '单基因 co-dominant / incomplete-dominant 性状。主要表现为头部纹路退化、减少或消失。visual 表示单拷贝表现；super 的表现和生存性须以谱系记录验证。'
where id = 'skullface';

insert into public.gene_aliases (alias, gene_id, state_hint, probability_hint, notes)
values ('鬼脸', 'skullface', 'visual', 1, '单基因 co-dominant；头纹退化、减少或消失')
on conflict (alias) do update set gene_id = excluded.gene_id, state_hint = excluded.state_hint,
  probability_hint = excluded.probability_hint, notes = excluded.notes;

insert into public.morphs (id, name_zh, name_en, morph_type, description)
values ('coral', '珊瑚', 'Coral', 'named_combo', '组合形态：Lavender visual + Albino visual，即薰衣草与白化同时为视觉表现。')
on conflict (id) do update set name_zh = excluded.name_zh, name_en = excluded.name_en,
  morph_type = excluded.morph_type, description = excluded.description;

insert into public.morph_components (morph_id, gene_id, required_state, notes)
values
  ('coral', 'lavender', 'visual', '珊瑚所需的薰衣草视觉表现'),
  ('coral', 'albino', 'visual', '珊瑚所需的白化视觉表现')
on conflict (morph_id, gene_id) do update set required_state = excluded.required_state, notes = excluded.notes;

insert into public.gene_aliases (alias, gene_id, state_hint, probability_hint, notes)
values
  ('焦糖', 'caramel', 'visual', 1, '已确认的焦糖原子基因'),
  ('糖霜', 'frosted', 'unknown', 1, '命名和遗传模型存在冲突资料；保留 unknown，等待来源谱系确认')
on conflict (alias) do update set gene_id = excluded.gene_id, state_hint = excluded.state_hint,
  probability_hint = excluded.probability_hint, notes = excluded.notes;

commit;
