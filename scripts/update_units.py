#!/usr/bin/env python3
"""Обновление базы юнитов с olden-era.com.

Скачивает список юнитов (RU-имена и фракции), статы с английских страниц,
способности с русских страниц и портреты, затем перезаписывает
src/data/units/ и public/units/.

Запуск из корня проекта: python3 scripts/update_units.py
"""
import html as html_mod
import json
import os
import re
import sys
import time
import urllib.request

BASE = 'https://www.olden-era.com'
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT, 'src', 'data', 'units')
IMG_DIR = os.path.join(PROJECT, 'public', 'units')


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                raise
            print(f'  повтор {url}: {e}', flush=True)
            time.sleep(2)
    raise RuntimeError('unreachable')


def strip_text(html: str) -> str:
    text = re.sub(r'<script.*?</script>', ' ', html, flags=re.S)
    text = re.sub(r'<style.*?</style>', ' ', text, flags=re.S)
    text = re.sub(r'<[^>]+>', '|', text)
    text = re.sub(r'\s+', ' ', text)
    return re.sub(r'\s*\|[\s|]*', '|', text)


def parse_list(html: str, lang: str):
    """Упорядоченный список юнитов со страницы /<lang>/units."""
    pattern = rf'<a[^>]+href="(/{lang}/units/([^"?]+))[^"]*"[^>]*>(.*?)</a>'
    items = []
    for _href, slug, inner in re.findall(pattern, html, re.S):
        img = re.search(r'src="(/img/units/([a-z_]+)/[^"]+)"', inner)
        if not img:
            continue
        name = re.sub(r'<[^>]+>', ' ', inner)
        items.append({
            'slug': slug,
            'name': html_mod.unescape(re.sub(r'\s+', ' ', name).strip()),
            'faction': img.group(2),
            'img': img.group(1),
        })
    return items


STAT_RE = {
    'health': r'health\|:\|(\d+)',
    'attack': r'attack\|:\|(\d+)',
    'defense': r'defence\|:\|(\d+)',
    'initiative': r'initiative\|:\|(\d+)',
    'speed': r'speed\|:\|(\d+)',
    'growth': r'growth\|:\|(\d+)',
}


def parse_unit(html: str):
    t = strip_text(html)
    data = {}
    m = re.search(r'Tier\|(\d+)\|', t)
    data['tier'] = int(m.group(1)) if m else None
    for key, rx in STAT_RE.items():
        m = re.search(rx, t)
        data[key] = int(m.group(1)) if m else None
    m = re.search(r'damage\|:\|(\d+)(?:\s*[–—-]\s*(\d+))?\|', t)
    data['damageMin'] = int(m.group(1)) if m else None
    data['damageMax'] = int(m.group(2) or m.group(1)) if m else None
    m = re.search(r'Cost\|(\d+)', t)
    data['cost'] = int(m.group(1)) if m else None
    if re.search(r'/img/abilities/(ranged_attack|shooter)\b', html):
        data['attackType'] = 'ranged'
    elif '/img/abilities/long_reach' in html:
        data['attackType'] = 'long_reach'
    else:
        data['attackType'] = 'melee'
    data['flying'] = '/img/abilities/flying' in html
    return data


FLIGHT_CHUNK_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')


def decode_flight(html: str) -> str:
    """Склеенный RSC-payload страницы Next.js без JS-экранирования.

    Склейка до разбора важна: карточка способности может быть разрезана
    между соседними push-чанками.
    """
    return ''.join(json.loads(f'"{m}"') for m in FLIGHT_CHUNK_RE.findall(html))


def _collect_text(node) -> str:
    """Текст из дерева children RSC: строки собираются рекурсивно."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        # Элемент React в RSC: ["$", "tag", key, {props}] — текст в children.
        if len(node) == 4 and node[0] == '$' and isinstance(node[3], dict):
            children = node[3].get('children')
            return _collect_text(children) if children is not None else ''
        return ''.join(_collect_text(item) for item in node)
    return ''


def _children_text(window: str, class_name: str):
    """Текст children первого узла с данным классом внутри окна."""
    m = re.search(rf'{class_name}\\?",\\?"children\\?":', window)
    if not m:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(window[m.end():])
    except ValueError:
        return None
    text = re.sub(r'\s+', ' ', _collect_text(value)).strip()
    return html_mod.unescape(text) or None


def parse_abilities(flight: str):
    """Способности юнита из RSC-payload: слаг иконки, название, описание.

    Окно карточки — от её иконки до следующей иконки способности; иконки
    без тултипа рядом (декоративные повторы) пропускаются, слаги
    дедуплицируются по первому полному вхождению.
    """
    abilities = []
    seen = set()
    icons = list(re.finditer(r'/img/abilities/([a-z0-9_]+)\.webp', flight))
    for i, m in enumerate(icons):
        slug = m.group(1)
        end = icons[i + 1].start() if i + 1 < len(icons) else len(flight)
        window = flight[m.end():end]
        name = (_children_text(window, 'ability-tooltip-title')
                or _children_text(window, 'ability-name'))
        if not name or slug in seen:
            continue
        seen.add(slug)
        abilities.append({
            'id': slug,
            'name': name,
            'description': _children_text(window, 'ability-tooltip-desc') or '',
        })
    return abilities


def q(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def emit(unit: dict) -> str:
    lines = [
        f'id: {unit["slug"]}',
        f'name: {q(unit["nameRu"])}',
        f'nameEn: {q(unit["nameEn"])}',
        f'faction: {unit["faction"]}',
        f'tier: {unit["tier"]}',
        f'grade: {unit["grade"]}',
    ]
    if unit.get('upgradeOf'):
        lines.append(f'upgradeOf: {unit["upgradeOf"]}')
    lines += [
        f'image: units/{unit["faction"]}/{unit["slug"]}.webp',
        'stats:',
        f'  health: {unit["health"]}',
        f'  attack: {unit["attack"]}',
        f'  defense: {unit["defense"]}',
        f'  damageMin: {unit["damageMin"]}',
        f'  damageMax: {unit["damageMax"]}',
        f'  initiative: {unit["initiative"]}',
        f'  speed: {unit["speed"]}',
        f'attackType: {unit["attackType"]}',
        f'flying: {"true" if unit["flying"] else "false"}',
    ]
    if unit.get('abilities'):
        lines.append('abilities:')
        for a in unit['abilities']:
            lines.append(f'  - id: {a["id"]}')
            lines.append(f'    name: {q(a["name"])}')
            lines.append(f'    description: {q(a["description"])}')
    if unit.get('growth') is not None:
        lines.append(f'growth: {unit["growth"]}')
    if unit.get('cost') is not None:
        lines.append(f'cost: {unit["cost"]}')
    lines.append(f'source: {BASE}/ru/units/{unit["slug"]}')
    return '\n'.join(lines) + '\n'


def assign_grades(units):
    """Нейтралы — одиночные юниты; фракционные идут тройками:
    база + два альтернативных улучшения одного тира."""
    for u in units:
        u['grade'] = 0
    factional = [u for u in units if u['faction'] != 'neutral']
    problems = []
    for i in range(0, len(factional), 3):
        group = factional[i:i + 3]
        if len(group) != 3 or len({u['faction'] for u in group}) != 1 or \
                len({u['tier'] for u in group}) != 1:
            problems.append([u['slug'] for u in group])
            continue
        for grade, u in enumerate(group[1:], start=1):
            u['grade'] = grade
            u['upgradeOf'] = group[0]['slug']
    return problems


def main():
    print('Загружаю списки юнитов...', flush=True)
    ru_list = parse_list(fetch(f'{BASE}/ru/units').decode('utf-8'), 'ru')
    en_list = parse_list(fetch(f'{BASE}/en/units').decode('utf-8'), 'en')
    en_by_slug = {u['slug']: u['name'] for u in en_list}
    print(f'Найдено юнитов: {len(ru_list)}', flush=True)

    units = []
    for i, u in enumerate(ru_list):
        slug = u['slug']
        print(f'[{i + 1}/{len(ru_list)}] {slug}', flush=True)
        stats = parse_unit(fetch(f'{BASE}/en/units/{slug}').decode('utf-8'))
        ru_html = fetch(f'{BASE}/ru/units/{slug}').decode('utf-8')
        abilities = parse_abilities(decode_flight(ru_html))
        ability_ids = {a['id'] for a in abilities}
        expected = {'ranged': 'ranged_attack', 'long_reach': 'long_reach'}
        marker = expected.get(stats['attackType'])
        if marker and marker not in ability_ids:
            print(f'  ВНИМАНИЕ: attackType={stats["attackType"]}, '
                  f'но {marker} нет в способностях', flush=True)
        img_path = os.path.join(IMG_DIR, u['faction'], f'{slug}.webp')
        os.makedirs(os.path.dirname(img_path), exist_ok=True)
        with open(img_path, 'wb') as f:
            f.write(fetch(f'{BASE}{u["img"]}'))
        units.append({'slug': slug, 'nameRu': u['name'],
                      'nameEn': en_by_slug.get(slug, ''),
                      'faction': u['faction'], 'abilities': abilities, **stats})
        time.sleep(0.3)

    required = ['tier', 'health', 'attack', 'defense', 'damageMin', 'damageMax',
                'initiative', 'speed']
    broken = [u['slug'] for u in units if any(u.get(k) is None for k in required)]
    if broken:
        print(f'ОШИБКА: неполные данные у {broken}')
        return 1
    # У каждого юнита есть хотя бы базовая атака: пустой список — дрейф разметки.
    no_abilities = [u['slug'] for u in units if not u['abilities']]
    if no_abilities:
        print(f'ОШИБКА: не разобраны способности у {no_abilities}')
        return 1
    problems = assign_grades(units)
    if problems:
        print(f'ОШИБКА группировки база/улучшения: {problems}')
        return 1

    for u in units:
        d = os.path.join(DATA_DIR, u['faction'])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f'{u["slug"]}.yaml'), 'w', encoding='utf-8') as f:
            f.write(emit(u))
    print(f'Готово: {len(units)} юнитов записано в {DATA_DIR}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
