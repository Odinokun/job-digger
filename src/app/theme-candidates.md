# Кандидати теми - архів вибору

Довідник на випадок повернення: тут лежать **усі варіанти, які розглядалися**, з
точними значеннями, щоб будь-який можна було застосувати заново, не підбираючи
вдруге. Вибране зараз описане в [README поруч](./README.md#тема-ink), цей файл -
тільки відхилене й запасне.

Причина, чому файл існує: прототип на двох картках і застосунок на 48 компаніях із
довгими адресами виглядають по-різному, тому рішення може змінитися після роботи на
справжніх даних.

Усе нижче перевіряється на екрані Companies. Як застосувати будь-який набір -
[«Як підмінити тему»](#як-підмінити-тему) в кінці.

## Вибрано

| Частина | Значення |
| --- | --- |
| Палітра | Ink |
| Заголовки | Space Grotesk 600, letter-spacing -0.03em |
| Логотип | Fraunces 600, letter-spacing -0.014em |
| Тіло | Instrument Sans |
| Адреси | IBM Plex Mono |
| Бейджі | Solid - заливка токеном, текст `*-foreground` |

## Палітри

Дев'ять наборів. Назви токенів - ті, що в
`node_modules/@heroui/styles/dist/themes/default/variables.css`; перевизначати
потрібно лише базові, похідні (`*-hover`, `*-soft`, `border-secondary`) HeroUI
рахує через `color-mix` сам.

**Обмеження, яке діє на всі:** тон `accent` не має наближатися до `success` (~150),
`warning` (~66) і `danger` (~26) - інакше кнопка світиться тим самим кольором, що
бейдж статусу. Вільні діапазони: синє 230-270, циан 195-215, фіолетове 275-300,
маджента 330-345. Саме через це відпав варіант із бурштиновим accent.

| Набір | Accent (тон) | Нейтраль | Радіус | Шрифти |
| --- | --- | --- | --- | --- |
| **Ink** (вибрано) | без тону | chroma <= 0.006, hue 250 | 4px | Instrument Sans + Instrument Serif |
| Unread | азур 238 | chroma 0.002-0.007, hue 250 | 6px | Inter Tight + IBM Plex Mono |
| Dossier | циан 204 | chroma 0.002-0.011, hue 70-82 | 8px | Source Sans 3 + Newsreader |
| Manuscript | індиго 272 | chroma 0.004-0.014, hue 62-80 | 10px | Source Sans 3 + Fraunces |
| Nordic | небесний 232 | chroma 0.006-0.025, hue 240-248 | 12px | DM Sans |
| Reader | фіолет 288 | chroma 0.004-0.018, hue 282-288 | 6px | Source Serif 4 (увесь UI) |
| Carbon | циан 196 | chroma 0.004-0.013, hue 230-242 | 8px | Inter + Geist Mono |
| Porcelain | синій 252 | chroma 0.002-0.010, hue 250-252 | 14px | Instrument Sans |
| Oxide | слива 352 | chroma 0.002-0.014, hue 40-60 | 6px | Inter Tight + Bricolage Grotesque |

Прибрані ще на першому колі: **Queue** (фіолет 284, IBM Plex Sans, радіус 2px,
моноширинні назви платформ) і **Signal** (маджента 342, Manrope, радіус 14px).

### Що відрізняє кожен набір

- **Unread** - колір означає стан: нейтраль майже без відтінку, щоб єдина насичена
  пляма читалася як «тут щось нове».
- **Dossier** - 48 компаній як картотека: назва набрана як заголовок документа,
  адреси й параметри фільтрів - дрібним моноширинним, як примітка.
- **Manuscript** - холодний accent на теплій сепії, як папір і синє чорнило.
- **Nordic** - єдиний, де нейтраль має видимий відтінок (chroma до 0.025).
- **Reader** - інтерфейс цілком із засічками: екран Companies це переважно текст.
- **Carbon** - єдиний спроєктований від темної схеми, світла в ньому похідна.
- **Porcelain** - межі задає простір: `--border` майже збігається з `--surface`,
  тому поле вводу зроблене темнішим за картку, інакше його не видно.
- **Oxide** - єдиний теплий accent. Слива 352 проти danger 28 - лише 36 градусів
  різниці, тому взята суттєво темнішою (0.448 проти 0.555). Перевіряти треба
  кнопкою Delete поруч із Add company.

### Повні набори токенів

Світла схема в `:root`, темна в `.dark, [data-theme="dark"]`. Ink тут немає - він
у [`globals.css`](./globals.css).

#### Unread

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.979 0.002 250);
--foreground: oklch(0.205 0.005 250);
--surface: oklch(1 0 0);
--muted: oklch(0.508 0.007 250);
--default: oklch(0.942 0.003 250);
--default-foreground: oklch(0.205 0.005 250);
--field-background: oklch(1 0 0);
--field-foreground: oklch(0.205 0.005 250);
--field-placeholder: oklch(0.578 0.007 250);
--border: oklch(0.896 0.004 250);
--separator: oklch(0.925 0.003 250);
--accent: oklch(0.528 0.188 238);
--accent-foreground: oklch(0.99 0.005 238);
--success: oklch(0.582 0.125 150);
--warning: oklch(0.698 0.148 66);
--danger: oklch(0.572 0.208 26);
/* dark */
--background: oklch(0.148 0.004 250);
--foreground: oklch(0.968 0.002 250);
--surface: oklch(0.196 0.005 250);
--muted: oklch(0.698 0.007 250);
--default: oklch(0.258 0.006 250);
--default-foreground: oklch(0.968 0.002 250);
--field-background: oklch(0.196 0.005 250);
--field-foreground: oklch(0.968 0.002 250);
--field-placeholder: oklch(0.648 0.007 250);
--border: oklch(0.278 0.006 250);
--separator: oklch(0.238 0.005 250);
--accent: oklch(0.652 0.172 238);
--accent-foreground: oklch(0.145 0.032 238);
--success: oklch(0.722 0.138 150);
--warning: oklch(0.805 0.14 66);
--danger: oklch(0.652 0.19 26);
```

#### Dossier

```css
/* light */
--radius: 0.5rem;
--background: oklch(0.971 0.004 82);
--foreground: oklch(0.228 0.008 70);
--surface: oklch(0.993 0.002 82);
--muted: oklch(0.498 0.01 72);
--default: oklch(0.938 0.006 82);
--field-placeholder: oklch(0.568 0.009 72);
--border: oklch(0.888 0.008 78);
--separator: oklch(0.918 0.006 80);
--accent: oklch(0.472 0.092 204);
--accent-foreground: oklch(0.985 0.006 204);
--success: oklch(0.552 0.108 148);
--warning: oklch(0.672 0.135 60);
--danger: oklch(0.538 0.172 28);
/* dark */
--background: oklch(0.172 0.006 70);
--foreground: oklch(0.958 0.004 82);
--surface: oklch(0.224 0.007 70);
--muted: oklch(0.698 0.011 72);
--default: oklch(0.278 0.008 70);
--field-placeholder: oklch(0.648 0.01 72);
--border: oklch(0.298 0.008 70);
--separator: oklch(0.258 0.007 70);
--accent: oklch(0.692 0.108 204);
--accent-foreground: oklch(0.165 0.026 204);
--success: oklch(0.708 0.118 148);
--warning: oklch(0.792 0.128 66);
--danger: oklch(0.638 0.172 28);
```

#### Manuscript

```css
/* light */
--radius: 0.625rem;
--background: oklch(0.966 0.008 78);
--foreground: oklch(0.235 0.014 62);
--surface: oklch(0.992 0.004 80);
--muted: oklch(0.502 0.015 68);
--default: oklch(0.935 0.011 78);
--field-placeholder: oklch(0.572 0.014 68);
--border: oklch(0.882 0.014 74);
--separator: oklch(0.913 0.011 76);
--accent: oklch(0.472 0.168 272);
--accent-foreground: oklch(0.985 0.006 272);
--success: oklch(0.548 0.112 148);
--warning: oklch(0.668 0.14 58);
--danger: oklch(0.535 0.178 28);
/* dark */
--background: oklch(0.178 0.01 68);
--foreground: oklch(0.955 0.008 80);
--surface: oklch(0.228 0.011 68);
--muted: oklch(0.698 0.016 70);
--default: oklch(0.282 0.012 68);
--field-placeholder: oklch(0.645 0.015 70);
--border: oklch(0.302 0.012 68);
--separator: oklch(0.262 0.011 68);
--accent: oklch(0.692 0.158 272);
--accent-foreground: oklch(0.162 0.03 272);
--success: oklch(0.705 0.122 148);
--warning: oklch(0.79 0.132 64);
--danger: oklch(0.635 0.178 28);
```

#### Nordic

```css
/* light */
--radius: 0.75rem;
--background: oklch(0.972 0.008 240);
--foreground: oklch(0.222 0.021 248);
--surface: oklch(0.998 0.003 240);
--muted: oklch(0.515 0.024 246);
--default: oklch(0.94 0.012 240);
--field-placeholder: oklch(0.585 0.022 246);
--border: oklch(0.892 0.016 242);
--separator: oklch(0.922 0.012 242);
--accent: oklch(0.558 0.158 232);
--accent-foreground: oklch(0.995 0.004 232);
--success: oklch(0.585 0.118 152);
--warning: oklch(0.702 0.142 66);
--danger: oklch(0.575 0.2 24);
/* dark */
--background: oklch(0.165 0.018 248);
--foreground: oklch(0.962 0.006 240);
--surface: oklch(0.218 0.022 248);
--muted: oklch(0.705 0.024 246);
--default: oklch(0.272 0.024 248);
--field-placeholder: oklch(0.652 0.022 246);
--border: oklch(0.292 0.025 248);
--separator: oklch(0.248 0.022 248);
--accent: oklch(0.692 0.142 232);
--accent-foreground: oklch(0.155 0.035 240);
--success: oklch(0.725 0.13 152);
--warning: oklch(0.805 0.135 66);
--danger: oklch(0.655 0.185 24);
```

#### Reader

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.974 0.004 282);
--foreground: oklch(0.212 0.016 288);
--surface: oklch(1 0 0);
--muted: oklch(0.505 0.018 286);
--default: oklch(0.94 0.007 282);
--field-placeholder: oklch(0.575 0.017 286);
--border: oklch(0.892 0.009 284);
--separator: oklch(0.922 0.007 284);
--accent: oklch(0.468 0.178 288);
--accent-foreground: oklch(0.99 0.005 288);
--success: oklch(0.572 0.122 150);
--warning: oklch(0.695 0.145 64);
--danger: oklch(0.568 0.205 25);
/* dark */
--background: oklch(0.152 0.012 288);
--foreground: oklch(0.965 0.004 282);
--surface: oklch(0.202 0.014 288);
--muted: oklch(0.698 0.018 286);
--default: oklch(0.258 0.016 288);
--field-placeholder: oklch(0.645 0.017 286);
--border: oklch(0.278 0.017 288);
--separator: oklch(0.238 0.015 288);
--accent: oklch(0.688 0.165 288);
--accent-foreground: oklch(0.152 0.035 288);
--success: oklch(0.722 0.132 150);
--warning: oklch(0.8 0.138 64);
--danger: oklch(0.648 0.188 25);
```

#### Carbon

```css
/* light */
--radius: 0.5rem;
--background: oklch(0.962 0.004 230);
--foreground: oklch(0.198 0.012 240);
--surface: oklch(1 0 0);
--muted: oklch(0.498 0.014 238);
--default: oklch(0.934 0.006 230);
--field-placeholder: oklch(0.568 0.013 238);
--border: oklch(0.885 0.008 232);
--separator: oklch(0.916 0.006 232);
--accent: oklch(0.512 0.112 205);
--accent-foreground: oklch(0.99 0.005 205);
--success: oklch(0.578 0.125 152);
--warning: oklch(0.695 0.145 62);
--danger: oklch(0.568 0.205 25);
/* dark */
--background: oklch(0.132 0.008 242);
--foreground: oklch(0.968 0.004 230);
--surface: oklch(0.182 0.01 242);
--muted: oklch(0.692 0.014 238);
--default: oklch(0.245 0.012 242);
--field-placeholder: oklch(0.638 0.013 238);
--border: oklch(0.265 0.013 242);
--separator: oklch(0.222 0.011 242);
--accent: oklch(0.782 0.128 196);
--accent-foreground: oklch(0.142 0.03 200);
--success: oklch(0.728 0.138 152);
--warning: oklch(0.805 0.138 62);
--danger: oklch(0.652 0.19 25);
```

#### Porcelain

```css
/* light */
--radius: 0.875rem;
--background: oklch(0.988 0.002 250);
--foreground: oklch(0.215 0.008 252);
--surface: oklch(1 0 0);
--muted: oklch(0.528 0.01 252);
--default: oklch(0.955 0.003 250);
--field-background: oklch(0.968 0.003 250); /* темніше за картку - навмисно */
--field-placeholder: oklch(0.595 0.009 252);
--border: oklch(0.938 0.003 250); /* майже = surface */
--separator: oklch(0.955 0.002 250);
--accent: oklch(0.535 0.192 252);
--accent-foreground: oklch(0.99 0.005 252);
--success: oklch(0.578 0.125 152);
--warning: oklch(0.698 0.146 66);
--danger: oklch(0.572 0.205 25);
/* dark */
--background: oklch(0.158 0.006 252);
--foreground: oklch(0.968 0.003 250);
--surface: oklch(0.205 0.008 252);
--muted: oklch(0.705 0.01 252);
--default: oklch(0.255 0.009 252);
--field-background: oklch(0.238 0.009 252);
--field-placeholder: oklch(0.652 0.01 252);
--border: oklch(0.235 0.008 252);
--separator: oklch(0.215 0.007 252);
--accent: oklch(0.665 0.175 252);
--accent-foreground: oklch(0.152 0.035 252);
--success: oklch(0.722 0.135 152);
--warning: oklch(0.805 0.14 66);
--danger: oklch(0.652 0.19 25);
```

#### Oxide

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.968 0.005 60);
--foreground: oklch(0.228 0.012 40);
--surface: oklch(0.995 0.002 60);
--muted: oklch(0.502 0.014 45);
--default: oklch(0.938 0.007 60);
--field-placeholder: oklch(0.572 0.013 45);
--border: oklch(0.885 0.009 55);
--separator: oklch(0.915 0.007 58);
--accent: oklch(0.448 0.142 352);
--accent-foreground: oklch(0.985 0.006 352);
--success: oklch(0.552 0.112 150);
--warning: oklch(0.672 0.138 60);
--danger: oklch(0.555 0.195 28);
/* dark */
--background: oklch(0.172 0.008 45);
--foreground: oklch(0.955 0.005 60);
--surface: oklch(0.222 0.009 45);
--muted: oklch(0.695 0.014 48);
--default: oklch(0.278 0.01 45);
--field-placeholder: oklch(0.642 0.013 48);
--border: oklch(0.298 0.011 45);
--separator: oklch(0.258 0.01 45);
--accent: oklch(0.672 0.148 352);
--accent-foreground: oklch(0.158 0.032 352);
--success: oklch(0.708 0.122 150);
--warning: oklch(0.792 0.13 64);
--danger: oklch(0.642 0.185 28);
```

## Шрифти заголовків

Десять кандидатів, усі з Google Fonts. `weight` і `letter-spacing` підібрані під
кожне сімейство: однакові значення на дидоні й на гротеску дають різний результат.
Кирилиця не перевірялася ні для одного - основна версія англійська.

| Шрифт | `next/font/google` | Вага | letter-spacing | Чим вирізняється |
| --- | --- | --- | --- | --- |
| **Space Grotesk** (вибрано) | `Space_Grotesk` | 600 | -0.03em | Зрізані кути, вузька «a». Тримає різкий радіус 4px краще за будь-який серіф |
| Instrument Sans | `Instrument_Sans` | 600 | -0.022em | Той самий, що в тілі - окремого шрифту не треба взагалі |
| Fraunces | `Fraunces` | 600 | -0.014em | Змінний серіф із «wonk»: засічки нерівні, назва виглядає написаною |
| Newsreader | `Newsreader` | 500 | -0.004em | Вузький екранний серіф, виграє місце в довгих назвах |
| Source Serif 4 | `Source_Serif_4` | 600 | -0.012em | Міцний текстовий серіф, добре і на 30px, і на 18px |
| Lora | `Lora` | 600 | -0.008em | «Пензель» у вигинах, тепліший за Source Serif |
| Playfair Display | `Playfair_Display` | 600 | -0.018em | Дидон; тонкі штрихи сипляться на 18px. Затертий у шаблонах |
| DM Serif Display | `DM_Serif_Display` | 400 | -0.016em | Одна вага, жирного не існує. Лише під заголовки |
| Bricolage Grotesque | `Bricolage_Grotesque` | 700 | -0.03em | Нерівні ширини літер, на h1 читається як лого |
| Archivo | `Archivo` | 700 | -0.028em | Щільний новинний гротеск, вужчий за Instrument Sans |

**Instrument Serif** (`Instrument_Serif`, вага 400, -0.005em) стояв у темі першим і
був відхилений автором. Вага в нього лише одна, тому `font-bold` дає синтетичне
жирне - звідси правило «ієрархія розміром, не вагою», яке лишилося й зі Space Grotesk.

## Шрифти логотипа

Напис «Job Digger» у хедері вибирався окремо від заголовків: на останньому колі
стояли два кандидати, кожен у парі з кожним заголовком.

| Шрифт | `next/font/google` | Вага | letter-spacing |
| --- | --- | --- | --- |
| **Fraunces** (вибрано) | `Fraunces` | 600 | -0.014em |
| Playfair Display | `Playfair_Display` | 600 | -0.018em |

## Бейджі статусів

Чотири щільності. Ключове правило: `*-soft` і `*-soft-foreground` беруться з одного
токена, тому чим щільніший фон, тим ближче текст має бути до `--foreground`
сторінки - інакше текст зливається з фоном у пляму. Відсотки для схем різні, бо
`--foreground` у них протилежний.

| Обробка | Фон | Текст (світла / темна) | Обведення |
| --- | --- | --- | --- |
| **Solid** (вибрано) | заливка токеном | `*-foreground` | - |
| Soft 24% | 24% | 92% / 92% | 35% |
| Soft 50% | 50% | 55% / 28% | 70% |
| Soft 75% | 75% | 28% / 15% | 100% |

Відхилені раніше: **Soft 15%** (те, як HeroUI рахує за замовчуванням: текст 70/80%)
і **Vibrant** - вбудований `[data-vibrant-palette="true"]`, який підіймає
`*-soft-foreground` до 92% без жодного рядка в темі.

Формули для приглушених обробок:

```css
--<колір>-soft: color-mix(in oklab, var(--<колір>) <фон>%, transparent);
--<колір>-soft-foreground: color-mix(in oklab, var(--<колір>) <текст>%, var(--foreground));
--<колір>-soft-ring: color-mix(in oklab, var(--<колір>) <обведення>%, transparent);
```

`--*-soft-ring` у HeroUI немає - це наш токен, якщо колись знадобиться обведення.

## Геометрія

Те, що довелося перевизначати, і чому - подробиці в
[README](./README.md#тема-ink).

| Що | Дефолт HeroUI | У нас |
| --- | --- | --- |
| Кнопка | `rounded-3xl` = `--radius * 3` = 12px | 4px через `--radius-3xl` |
| Картка | `min(32px, --radius-3xl)` = 12px | 6px, перевизначенням `.card` |
| Рамка картки | немає зовсім, лише тінь | 1px `var(--border)` |
| Hover кнопки | `accent 90% + accent-foreground 10%` | явні значення |

## Як підмінити тему

1. Узяти набір токенів вище і замінити ним блоки `:root` і `.dark` у
   [`globals.css`](./globals.css). Похідні токени не переносити - HeroUI їх рахує сам.
2. Шрифти - у [`layout.tsx`](./layout.tsx): імена сімейств із таблиць вище,
   `subsets: ["latin", "latin-ext"]`.
3. Перевірити `npm run build`: він падає, якщо сімейства, ваги або субсета немає.
4. Перечитати, чи не стали неправдою твердження про тему в
   [README](./README.md#тема-ink) - зокрема про безтоновий accent і токен `--info`,
   бо вони справедливі лише для Ink.

Крок 4 найважливіший: `--info` існує саме тому, що в Ink accent без тону. У наборі
з кольоровим accent цей токен не потрібен, і бейдж «нові» має братися з accent.
