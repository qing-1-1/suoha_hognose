-- Correct the initial provisional metadata after source review.
-- Safe to run after 010. It also backfills existing Skullface individuals.

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

update public.snake_genes
set state = 'visual',
    probability = 1,
    source = 'manual',
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-08 curated: Skullface visual; co-dominant inheritance is defined in genes.')
where gene_id = 'skullface'
  and state = 'unknown';

-- Do not treat Frosted as a Caramel allele without pedigree/proof data.
update public.genes
set locus = null,
    inheritance_type = 'unknown',
    description = '糖霜 / Frosted 的命名及遗传模型存在冲突的公开资料：有资料称其为 Caramel + Hypo 组合，也有资料按独立隐性展示。当前保留 unknown，不能与焦糖合并为同一位点或参与概率计算。'
where id = 'frosted';

update public.genes
set locus = 'caramel',
    inheritance_type = 'recessive',
    description = '焦糖（T+ Albino / Caramel Albino）：隐性原子基因。不得因糖霜名称争议而与糖霜合并位点。'
where id = 'caramel';

insert into public.gene_aliases (alias, gene_id, state_hint, probability_hint, notes)
values ('糖霜', 'frosted', 'unknown', 1, '遗传模型待谱系来源确认；不得自动设为 visual 或与焦糖等位')
on conflict (alias) do update set gene_id = excluded.gene_id, state_hint = excluded.state_hint,
  probability_hint = excluded.probability_hint, notes = excluded.notes;

commit;
