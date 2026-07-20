/**
 * Обновление каталога навыков героев с olden-era.com.
 *
 * Скачивает список навыков (слаги базовых страниц), затем русские и
 * английские страницы всех трёх уровней мастерства каждого навыка
 * (название уровня, описание, свои поднавыки) и перезаписывает
 * src/data/skills/. Свои поднавыки уровня — первые N элементов сетки
 * поднавыков, где N берётся из JSON-LD страницы («Sub-skills / Perks
 * Count»); остальные элементы сетки — синергии чужих навыков и в
 * каталог не пишутся. Базовое имя навыка — свойство «Base Skill» оттуда
 * же.
 *
 * Запуск из корня проекта: npm run update-skills
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BASE, fetchText, q, unescapeHtml } from './scrape_common.ts';
import { parseSkill } from './update_heroes.ts';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(PROJECT, 'src', 'data', 'skills');

/** Слаги уровней мастерства в порядке возрастания уровня */
const LEVEL_SLUGS = ['basic', 'advanced', 'expert'] as const;

/** Текст без тегов с нормализованными пробелами и сущностями */
const cleanText = (html: string): string =>
  unescapeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Поднавык из сетки страницы уровня */
export interface ParsedSubskill {
  id: string;
  name: string;
  description: string;
}

/** Данные страницы уровня навыка на одном языке */
export interface ParsedSkillPage {
  /** Название уровня («Основы нападения»); null — не найдено */
  name: string | null;
  description: string | null;
  /** Базовое имя навыка из JSON-LD («Атака»); null — не найдено */
  baseName: string | null;
  /** Число своих поднавыков уровня из JSON-LD; null — свойства нет */
  ownCount: number | null;
  /** Все элементы сетки поднавыков: свои первые, затем синергии */
  subskills: ParsedSubskill[];
}

export function parseSkillPage(html: string): ParsedSkillPage {
  const { name, description } = parseSkill(html);
  let baseName: string | null = null;
  let ownCount: number | null = null;
  for (const [, raw] of html.matchAll(
    /<script type="application\/ld\+json">(.*?)<\/script>/gs,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const props = (data as { additionalProperty?: { name?: string; value?: unknown }[] })
      .additionalProperty;
    for (const prop of props ?? []) {
      if (prop.name === 'Base Skill') baseName = cleanText(String(prop.value));
      if (prop.name === 'Sub-skills / Perks Count') ownCount = Number(prop.value);
    }
  }
  const subskills: ParsedSubskill[] = [];
  const section = html.split('subskills-full-section">')[1];
  if (section) {
    for (const m of section.matchAll(
      /subskills-grid-img"><img src="\/img\/subskills\/([a-z0-9_]+)\.webp".*?subskill-text-header">(.*?)<\/div>.*?subskill-text-main">(.*?)<\/div>/gs,
    )) {
      subskills.push({ id: m[1], name: cleanText(m[2]), description: cleanText(m[3]) });
    }
  }
  return { name, description, baseName, ownCount, subskills };
}

/** Страница уровня на обоих языках */
interface LevelPages {
  ru: ParsedSkillPage;
  en: ParsedSkillPage;
}

/** Собранный навык: слаг и страницы трёх уровней */
export interface SkillData {
  slug: string;
  /** Индекс — уровень мастерства − 1 */
  levels: LevelPages[];
}

/** Свои поднавыки уровня: первые ownCount элементов сетки */
const ownSubskills = (page: ParsedSkillPage): ParsedSubskill[] =>
  page.subskills.slice(0, page.ownCount ?? 0);

export function emitSkill(skill: SkillData): string {
  const basic = skill.levels[0];
  const lines = [
    `id: ${skill.slug}`,
    `name: ${q(basic.ru.baseName ?? '')}`,
    `nameEn: ${q(basic.en.baseName ?? '')}`,
    'levels:',
  ];
  for (const level of skill.levels) {
    lines.push(
      `  - name: ${q(level.ru.name ?? '')}`,
      `    nameEn: ${q(level.en.name ?? '')}`,
      `    description: ${q(level.ru.description ?? '')}`,
      `    descriptionEn: ${q(level.en.description ?? '')}`,
    );
  }
  const subskillLines: string[] = [];
  skill.levels.forEach((level, index) => {
    const en = ownSubskills(level.en);
    ownSubskills(level.ru).forEach((sub, i) => {
      subskillLines.push(
        `  - id: ${sub.id}`,
        `    tier: ${index + 1}`,
        `    name: ${q(sub.name)}`,
        `    nameEn: ${q(en[i]?.name ?? '')}`,
        `    description: ${q(sub.description)}`,
        `    descriptionEn: ${q(en[i]?.description ?? '')}`,
      );
    });
  });
  if (subskillLines.length > 0) {
    lines.push('subskills:', ...subskillLines);
  } else {
    lines.push('subskills: []');
  }
  lines.push(`source: ${BASE}/ru/skills/basic_${skill.slug}`);
  return lines.join('\n') + '\n';
}

/** Слаги навыков со страницы списка: без префикса уровня, по алфавиту */
export function parseSkillList(html: string): string[] {
  const slugs = new Set<string>();
  for (const [, slug] of html.matchAll(/href="\/ru\/skills\/basic_([a-z0-9_]+)"/g)) {
    slugs.add(slug);
  }
  return [...slugs].sort();
}

function validate(skills: SkillData[]): string[] {
  const problems: string[] = [];
  for (const skill of skills) {
    const basic = skill.levels[0];
    if (!basic.ru.baseName || !basic.en.baseName) {
      problems.push(`${skill.slug}: нет базового имени`);
    }
    const seen = new Set<string>();
    skill.levels.forEach((level, index) => {
      const where = `${skill.slug}/${LEVEL_SLUGS[index]}`;
      for (const [lang, page] of [['ru', level.ru], ['en', level.en]] as const) {
        if (!page.name || !page.description) {
          problems.push(`${where}: неполные тексты (${lang})`);
        }
      }
      // На базовом уровне своих поднавыков не бывает, выше — обязательны.
      if (index === 0) {
        if (level.ru.ownCount !== null) {
          problems.push(`${where}: неожиданные поднавыки на базовом уровне`);
        }
        return;
      }
      const ru = ownSubskills(level.ru);
      const en = ownSubskills(level.en);
      if (level.ru.ownCount === null || ru.length !== level.ru.ownCount) {
        problems.push(`${where}: сетка поднавыков короче заявленного числа`);
        return;
      }
      if (en.map((s) => s.id).join() !== ru.map((s) => s.id).join()) {
        problems.push(`${where}: русские и английские поднавыки не совпадают`);
      }
      for (const sub of ru) {
        if (seen.has(sub.id)) problems.push(`${where}: повтор поднавыка ${sub.id}`);
        seen.add(sub.id);
      }
      for (const sub of [...ru, ...en]) {
        if (!sub.name || !sub.description) {
          problems.push(`${where}: неполные тексты поднавыка ${sub.id}`);
        }
      }
    });
  }
  return problems;
}

async function main(): Promise<number> {
  console.log('Загружаю список навыков...');
  const slugs = parseSkillList(await fetchText(`${BASE}/ru/skills`));
  console.log(`Найдено навыков: ${slugs.length}`);

  const skills: SkillData[] = [];
  for (const [i, slug] of slugs.entries()) {
    console.log(`[${i + 1}/${slugs.length}] ${slug}`);
    const levels: LevelPages[] = [];
    for (const level of LEVEL_SLUGS) {
      const ru = parseSkillPage(await fetchText(`${BASE}/ru/skills/${level}_${slug}`));
      const en = parseSkillPage(await fetchText(`${BASE}/en/skills/${level}_${slug}`));
      levels.push({ ru, en });
      await sleep(300);
    }
    skills.push({ slug, levels });
  }

  const problems = validate(skills);
  if (problems.length > 0) {
    console.log(`ОШИБКА:\n  ${problems.join('\n  ')}`);
    return 1;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  for (const skill of skills) {
    writeFileSync(path.join(DATA_DIR, `${skill.slug}.yaml`), emitSkill(skill));
  }
  console.log(`Готово: ${skills.length} навыков записано в ${DATA_DIR}`);
  return 0;
}

// Прямой запуск: node scripts/update_skills.ts; при импорте main не выполняется.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
