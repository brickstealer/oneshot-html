import { BIOMES } from './worldGen';
import type { BiomeId } from './types';

export interface BiomePassengerProfile {
  name: string;
  coatHex: number;
  pantsHex: number;
  skinHex: number;
  quotes: readonly string[];
}

export interface GeneratedPassenger {
  name: string;
  archetype: BiomeId;
  coatHex: number;
  pantsHex: number;
  skinHex: number;
  quote: string;
}

export const BIOME_PASSENGERS: Record<BiomeId, readonly BiomePassengerProfile[]> = {
  metropolis: [
    {
      name: 'Брокер Уолл-Стрит',
      coatHex: 0x1e293b,
      pantsHex: 0x0f172a,
      skinHex: 0xf1c29b,
      quotes: [
        '«Гони! Пока стоим на светофоре, биткоин упал!»',
        '«Двойные чаевые, если успеем до звонка биржи!»',
      ],
    },
    {
      name: 'Бариста на Эспрессо',
      coatHex: 0x0f766e,
      pantsHex: 0x1e293b,
      skinHex: 0xe6b58f,
      quotes: [
        '«Осторожнее на поворотах — у меня 6 стаканов латте!»',
        '«Запах жжёной резины бодрит лучше арабики!»',
      ],
    },
    {
      name: 'Магнат из Пентхауса',
      coatHex: 0x4c1d95,
      pantsHex: 0x18181b,
      skinHex: 0xf4caa6,
      quotes: [
        '«Вертолёт на ТО, пришлось брать земной транспорт!»',
        '«Включи автопилот и не смотри на спидометр!»',
      ],
    },
  ],

  riviera: [
    {
      name: 'Диджей с Пляжа',
      coatHex: 0x06b6d4,
      pantsHex: 0xf8fafc,
      skinHex: 0xd99b6c,
      quotes: [
        '«Басы погромче! Закатная вечеринка без меня не начнётся!»',
        '«Песок с шлёпок отряхнул, клянусь!»',
      ],
    },
    {
      name: 'Сёрфер Кахуна',
      coatHex: 0xf97316,
      pantsHex: 0x0284c7,
      skinHex: 0xc98a5b,
      quotes: [
        '«Ловим зелёную волну, бро, как на океане!»',
        '«В багажник доска влезет? Отлично, погнали!»',
      ],
    },
    {
      name: 'Курортная Дива',
      coatHex: 0xec4899,
      pantsHex: 0xfef3c7,
      skinHex: 0xeeb891,
      quotes: [
        '«Только помедленнее мимо яхт — пусть все посмотрят!»',
        '«Кондиционер на максимум, мне нельзя терять загар!»',
      ],
    },
  ],

  canyon: [
    {
      name: 'Шериф Дикого Каньона',
      coatHex: 0x92400e,
      pantsHex: 0x3b2f2f,
      skinHex: 0xdba072,
      quotes: [
        '«Йи-ха! Погоним этого железного мустанга во весь опор!»',
        '«В этом городе мало места для двоих таксистов!»',
      ],
    },
    {
      name: 'Золотоискатель Боб',
      coatHex: 0xb45309,
      pantsHex: 0x44403c,
      skinHex: 0xd49a6a,
      quotes: [
        '«Мешок тяжёлый — там чистые самородки, шеф!»',
        '«Вези в банк, пока койоты не пронюхали!»',
      ],
    },
    {
      name: 'Дальнобойщик Сэм',
      coatHex: 0xb91c1c,
      pantsHex: 0x1e3a8a,
      skinHex: 0xe3ad82,
      quotes: [
        '«Отличный рык мотора! Сколько здесь лошадей под капотом?»',
        '«Завези по пути за буррито с двойным перцем!»',
      ],
    },
  ],

  alpine: [
    {
      name: 'Альпийский Йети',
      coatHex: 0xe2e8f0,
      pantsHex: 0xcbd5e1,
      skinHex: 0xcbe3f5,
      quotes: [
        '«Уррр! Лыжи сломал, пришлось вызывать бизнес-класс!»',
        '«Не фоткай меня — я официально мифическое существо!»',
      ],
    },
    {
      name: 'Фрирайдер Макс',
      coatHex: 0x0284c7,
      pantsHex: 0x0f172a,
      skinHex: 0xf1c29b,
      quotes: [
        '«Подъёмник закрыли, докинешь до самой вершины?»',
        '«Ого, на такой резине можно и по чёрной трассе!»',
      ],
    },
    {
      name: 'Мастер Фондю',
      coatHex: 0xdc2626,
      pantsHex: 0x1e293b,
      skinHex: 0xf3c6a0,
      quotes: [
        '«Осторожно, котелок с сыром ещё кипит!»',
        '«В горах прохладно, обогрев сидений — просто сказка!»',
      ],
    },
  ],

  sakura: [
    {
      name: 'Сэнсэй Такеши',
      coatHex: 0xbe123c,
      pantsHex: 0x1e1b4b,
      skinHex: 0xf2c9a6,
      quotes: [
        '«Истинный дрифт — это спокойствие разума на 200 км/ч.»',
        '«Лепестки сакуры падают медленнее, чем работает твой V12!»',
      ],
    },
    {
      name: 'Мастер Рамена',
      coatHex: 0xf59e0b,
      pantsHex: 0x1c1917,
      skinHex: 0xebc09b,
      quotes: [
        '«Доставим бульон горячим, иначе позор на весь квартал!»',
        '«У тебя самый плавный ход в этой префектуре!»',
      ],
    },
    {
      name: 'Ниндзя-Курьер',
      coatHex: 0x312e81,
      pantsHex: 0x0f172a,
      skinHex: 0xefd0b1,
      quotes: [
        '«Я мог бы бежать по крышам, но сегодня лень.»',
        '«Высади у ворот тории и сделай вид, что не видел меня!»',
      ],
    },
  ],

  mushroom: [
    {
      name: 'Грибной Гном Боровик',
      coatHex: 0xdc2626,
      pantsHex: 0xfef3c7,
      skinHex: 0xf5d0a9,
      quotes: [
        '«Шляпкой потолок не задену? У меня сегодня свежие споры!»',
        '«Вези на поляну, пока грибники с корзинками не пришли!»',
      ],
    },
    {
      name: 'Королева Мухоморов',
      coatHex: 0xef4444,
      pantsHex: 0xffffff,
      skinHex: 0xf8d8c4,
      quotes: [
        '«Вся эта неоновая пыльца отлично сочетается с моей шляпой!»',
        '«Аккуратнее, в салоне пахнет лесным волшебством!»',
      ],
    },
    {
      name: 'Миколог-Авантюрист',
      coatHex: 0x7c3aed,
      pantsHex: 0x3f6212,
      skinHex: 0xe6b58f,
      quotes: [
        '«Я нашёл говорящий опёнок — едем в лабораторию!»',
        '«Этот гигантский шампиньон только что моргнул мне!»',
      ],
    },
  ],

  medieval: [
    {
      name: 'Сэр Ланселот Железный',
      coatHex: 0x94a3b8,
      pantsHex: 0x475569,
      skinHex: 0xebd0b3,
      quotes: [
        '«Конь в кузнице на перековке, жми на железный газ!»',
        '«Благородная колесница! Сколько драконьих сил под капотом?»',
      ],
    },
    {
      name: 'Придворный Алхимик',
      coatHex: 0x5b21b6,
      pantsHex: 0x1e1b4b,
      skinHex: 0xf2c9a6,
      quotes: [
        '«Не тормози резко — в колбе эликсир вечного бензина!»',
        '«Я заплачу чистым золотом, только что сварил из свинца!»',
      ],
    },
    {
      name: 'Королевский Паладин',
      coatHex: 0x1d4ed8,
      pantsHex: 0x64748b,
      skinHex: 0xefc39b,
      quotes: [
        '«Турнир начинается через 5 минут — включи мигалку!»',
        '«Прости, если латы поцарапали кожаный салон!»',
      ],
    },
  ],

  rome: [
    {
      name: 'Император Гай Юлий',
      coatHex: 0xf8fafc,
      pantsHex: 0x991b1b,
      skinHex: 0xe5b68d,
      quotes: [
        '«Пришёл, увидел, вызвал такси бизнес-класса!»',
        '«Все дороги ведут в Колизей — но давай без пробок!»',
      ],
    },
    {
      name: 'Центурион Максимус',
      coatHex: 0xb91c1c,
      pantsHex: 0x78350f,
      skinHex: 0xdca57a,
      quotes: [
        '«Мой легион марширует пешком, а я с комфортом!»',
        '«Колесница без лошадей? Сенат одобряет эту магию!»',
      ],
    },
    {
      name: 'Сенатор Цицерон',
      coatHex: 0xfef3c7,
      pantsHex: 0x7c2d12,
      skinHex: 0xebc19c,
      quotes: [
        '«О времена, о тарифы! Но сервис — на пять звёзд!»',
        '«Вези на Форум, мне ещё три часа спорить с патрициями!»',
      ],
    },
  ],

  egypt: [
    {
      name: 'Фараон Рамзес III',
      coatHex: 0xf59e0b,
      pantsHex: 0x1d4ed8,
      skinHex: 0xc98b5b,
      quotes: [
        '«Вези к пирамиде — строители опять перепутали чертежи!»',
        '«Оставь сдачу себе, у меня полная гробница золота!»',
      ],
    },
    {
      name: 'Мумия Тутанхамона',
      coatHex: 0xe7dfc8,
      pantsHex: 0xd6cbb0,
      skinHex: 0xd9cfb6,
      quotes: [
        '«Спал 3000 лет, а пробки в центре всё те же!»',
        '«Окно не открывай — бинты размотаются на ветру!»',
      ],
    },
    {
      name: 'Жрица Клеопатры',
      coatHex: 0x0284c7,
      pantsHex: 0xfef08a,
      skinHex: 0xd4976a,
      quotes: [
        '«Верблюд застрял в барханах, спасай!»',
        '«Благословляю твой навигатор на зелёный свет!»',
      ],
    },
  ],

  candy: [
    {
      name: 'Принцесса Пончик',
      coatHex: 0xf472b6,
      pantsHex: 0xfef08a,
      skinHex: 0xfbe0ce,
      quotes: [
        '«Осторожнее — у меня глазурь ещё не застыла!»',
        '«У тебя в салоне так вкусно пахнет ванилью или это я?»',
      ],
    },
    {
      name: 'Барон Карамелькин',
      coatHex: 0xa855f7,
      pantsHex: 0x38bdf8,
      skinHex: 0xf5cbb0,
      quotes: [
        '«Заплачу мармеладными слитками по курсу ЦБ!»',
        '«Вези на шоколадную фабрику, там авария с зефиром!»',
      ],
    },
    {
      name: 'Леденцовый Маг',
      coatHex: 0x22d3ee,
      pantsHex: 0xf472b6,
      skinHex: 0xf7d5be,
      quotes: [
        '«Не облизывай руль, он не из лакрицы!»',
        '«Сладкий дрифт! Ставлю пять сахарных звёзд!»',
      ],
    },
  ],

  dino: [
    {
      name: 'Вождь Уга-Буга',
      coatHex: 0xb45309,
      pantsHex: 0x78350f,
      skinHex: 0xc98a5b,
      quotes: [
        '«Уга-буга! Железный зверь бегать быстрее тираннозавра!»',
        '«Моя дубина класть в багажник, твоя везти пещера!»',
      ],
    },
    {
      name: 'Охотник на Мамонтов',
      coatHex: 0x92400e,
      pantsHex: 0x57534e,
      skinHex: 0xd19466,
      quotes: [
        '«Колесо — гениальная штука! Вчера только придумали!»',
        '«Жми педаль, за нами голодный велоцираптор!»',
      ],
    },
    {
      name: 'Шаман Вулкана',
      coatHex: 0x15803d,
      pantsHex: 0x713f12,
      skinHex: 0xbe8254,
      quotes: [
        '«Духи бензина довольны твоим апгрейдом, воин дороги!»',
        '«До дождя из метеоритов успеем доехать?»',
      ],
    },
  ],

  cyberpunk: [
    {
      name: 'Кибер-Хакер V-2099',
      coatHex: 0x06b6d4,
      pantsHex: 0x111827,
      skinHex: 0xdbeafe,
      quotes: [
        '«Я чуть-чуть разогнал твой бортовой ИИ, не благодари!»',
        '«Уходим от дронов мегакорпорации через неоновый переулок!»',
      ],
    },
    {
      name: 'Неоновый Андроид X-9',
      coatHex: 0xd946ef,
      pantsHex: 0x0f172a,
      skinHex: 0xc7d2fe,
      quotes: [
        '«Заряд батареи 4% — подключусь к прикуривателю?»',
        '«Вероятность отличной поездки: 99.97%!»',
      ],
    },
    {
      name: 'Хромированный Самурай',
      coatHex: 0xec4899,
      pantsHex: 0x1e293b,
      skinHex: 0xe2e8f0,
      quotes: [
        '«Твоя неоновая подсветка — чистый кибер-стиль!»',
        '«Высади у голограммы — и не сохраняй логи маршрута!»',
      ],
    },
  ],

  moon: [
    {
      name: 'Космонавт Нил Лунный',
      coatHex: 0xf8fafc,
      pantsHex: 0xe2e8f0,
      skinHex: 0xf1c29b,
      quotes: [
        '«Хьюстон, такси прибыло! Один маленький шаг в салон!»',
        '«При лунной гравитации дрифт просто космический!»',
      ],
    },
    {
      name: 'Лунный Ксенобиолог',
      coatHex: 0xe2e8f0,
      pantsHex: 0x38bdf8,
      skinHex: 0x86efac,
      quotes: [
        '«В контейнере светящийся лунный мох — только не тряси!»',
        '«Я с другой галактики, у вас берут звёздные кредиты?»',
      ],
    },
    {
      name: 'Командир Кратера-7',
      coatHex: 0xf1f5f9,
      pantsHex: 0xf59e0b,
      skinHex: 0xe6b58f,
      quotes: [
        '«Луноход сел в кратере, выручай до космодрома!»',
        '«Скорее бы взлетать — атмосфера тут и так отсутствует!»',
      ],
    },
  ],
};

function crossBiomeQuote(dropoffBiome: BiomeId, variant: number): string {
  const dest = BIOMES[dropoffBiome].nameRu;
  const templates = [
    `«Вези в «${dest}» — местные не поймут, но мне срочно!»`,
    `«Мне в «${dest}», говорят, там сегодня аншлаг!»`,
    `«Прямиком в «${dest}»! Не спрашивай зачем — по делам!»`,
  ];
  return templates[Math.abs(variant) % templates.length];
}

/**
 * Deterministically picks a vivid crazy biome-themed passenger matching the pickup biome,
 * complete with costume colors and a hilarious Russian trip quote.
 */
export function generateBiomePassenger(
  pickupBiome: BiomeId,
  dropoffBiome: BiomeId,
  seed: number,
): GeneratedPassenger {
  const roster = BIOME_PASSENGERS[pickupBiome];
  const s = Math.abs(Math.floor(seed));
  const profile = roster[s % roster.length];

  // When crossing into a different biome, occasionally inject a funny cross-biome travel joke
  const useCrossBiome = dropoffBiome !== pickupBiome && s % 3 === 2;
  const quote = useCrossBiome
    ? crossBiomeQuote(dropoffBiome, Math.floor(s / 3))
    : profile.quotes[Math.floor(s / roster.length) % profile.quotes.length];

  return {
    name: profile.name,
    archetype: pickupBiome,
    coatHex: profile.coatHex,
    pantsHex: profile.pantsHex,
    skinHex: profile.skinHex,
    quote,
  };
}

/**
 * Returns themed outfit colors for ambient pedestrians & peer-taxi passengers in any biome.
 */
export function getBiomeCrowdOutfit(
  biome: BiomeId,
  variant: number,
): { coatHex: number; pantsHex: number; skinHex: number } {
  const roster = BIOME_PASSENGERS[biome];
  const p = roster[Math.abs(variant) % roster.length];
  return {
    coatHex: p.coatHex,
    pantsHex: p.pantsHex,
    skinHex: p.skinHex,
  };
}
