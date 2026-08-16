import {
  Entity,
  EmlMessage,
  BestiaryEntry,
  GrimoireItem,
  AudioTrackSegment,
  Chapter,
} from '../types/chronicle';
import {
  buildPlayerIntentEml,
  buildMasterResolutionEml,
  buildPartyArtEml,
  parseEmlString,
} from './mimeEml';

export const INITIAL_ENTITIES: Entity[] = [
  {
    id: 'char_wizard_elena',
    actorId: 'char_wizard_elena',
    name: 'Elena (Wizard Lvl 3)',
    role: 'player',
    characterClass: 'Evocation Wizard',
    level: 3,
    hp: 14,
    maxHp: 16,
    ac: 12,
    speed: 6,
    initiative: 15,
    pos: [3, 4],
    status: 'Alive',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    color: '#8b5cf6',
    spells: ['Scorching Ray', 'Shield', 'Mage Armor', 'Magic Missile'],
    weapons: [{ name: 'Quarterstaff', damage: '1d6 bludgeoning', range: 1 }],
  },
  {
    id: 'char_warrior',
    actorId: 'char_warrior',
    name: 'Torin (Warrior Lvl 3)',
    role: 'player',
    characterClass: 'Battle Master Fighter',
    level: 3,
    hp: 24,
    maxHp: 32,
    ac: 17,
    speed: 6,
    initiative: 12,
    pos: [11, 8],
    status: 'Alive',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    color: '#3b82f6',
    spells: [],
    weapons: [{ name: 'Greatsword', damage: '2d6+3 slashing', range: 1 }],
  },
  {
    id: 'mob_shaman',
    name: 'Goblin Ashen Shaman',
    role: 'enemy',
    hp: 0,
    maxHp: 28,
    ac: 13,
    speed: 6,
    initiative: 14,
    pos: [12, 8],
    status: 'Dead',
    avatarUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80',
    color: '#ef4444',
    spells: ['Blight Chant', 'Hex Flame'],
    weapons: [{ name: 'Bone Staff', damage: '1d6 necrotic', range: 1 }],
  },
  {
    id: 'mob_archer_1',
    name: 'Goblin Scout Archer',
    role: 'enemy',
    hp: 12,
    maxHp: 14,
    ac: 13,
    speed: 6,
    initiative: 16,
    pos: [14, 3],
    status: 'Alive',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    color: '#f97316',
    weapons: [{ name: 'Shortbow', damage: '1d6+2 piercing', range: 16 }],
  },
];

// Sample artwork base64 / URLs
export const SAMPLE_ARTWORK_URL = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80';

// Raw EML strings matching exact specs from Section 2
export const RAW_INTENT_R03_ELENA = buildPlayerIntentEml(
  {
    from: 'Elena <elena@party.local>',
    to: 'Dungeon Master <dm@chronicle.local>',
    subject: 'Re: [Round 3] Action: Elena (Wizard Lvl 3)',
    inReplyTo: '<round-03-master-init@vault.local>',
    messageId: '<intent-r03-elena@vault.local>',
    round: 3,
    actorId: 'char_wizard_elena',
  },
  {
    actor_id: 'char_wizard_elena',
    round: 3,
    movement: { path: [[2, 2], [2, 3], [3, 4]], dash: false },
    action: {
      type: 'cast_spell',
      spell_name: 'Scorching Ray',
      slot_level: 2,
      rays: [
        { target_id: 'mob_shaman', dice_seed: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
        { target_id: 'mob_shaman', dice_seed: 'f4c1b221d6e32e8b0a9b8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c' },
        { target_id: 'mob_archer_1', dice_seed: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0' }
      ]
    },
    fallback_rules: [
      {
        trigger: 'target_mob_shaman_dead_before_turn',
        redirect_all_to: 'mob_archer_1',
        description: 'Перенаправить оставшиеся лучи в лучника гоблинов'
      }
    ],
    reaction: {
      trigger: 'hit_by_melee_attack',
      spell: 'Shield',
      description: 'Сотворить Щит (+5 к КД при физической атаке)'
    }
  },
  {
    speech: 'Пепел к пеплу, тварь! Попробуй это пламя!',
    internal_thought: 'Лишь бы воин успел прикрыть фланг...',
    action_flavor: 'Елена отступает в тень саркофага, на ладонях разгорается пламя.',
    avatar_emotion_cid: 'cid:avatar_furious'
  }
);

export const RAW_RESOLUTION_R03 = buildMasterResolutionEml(
  {
    from: 'Dungeon Master <dm@chronicle.local>',
    to: 'Party <party@chronicle.local>',
    subject: '[Round 3] Resolution: Пепел на алтаре',
    inReplyTo: '<round-03-master-init@vault.local>',
    messageId: '<round-03-resolution@vault.local>',
    round: 3,
  },
  {
    round: 3,
    combat_status: 'Ended_Victory',
    entities: [
      { id: 'char_warrior', hp: 24, max_hp: 32, pos: [11, 8] },
      { id: 'char_wizard_elena', hp: 14, max_hp: 16, pos: [3, 4] },
      { id: 'mob_shaman', hp: 0, max_hp: 28, pos: [12, 8], status: 'Dead' }
    ],
    mechanical_log: [
      'Elena casts Scorching Ray: Ray 1 hits mob_shaman (12 fire dmg)',
      'Warrior attacks mob_shaman with Greatsword (14 slashing dmg)',
      'mob_shaman killed'
    ]
  },
  `Воздух в крипте задрожал от запаха озона. Шаман гоблинов вскинул костяной посох, но не успел закончить заклятие: огненные лучи Елены пробили его грудь. Секундой позже тяжелая секира Торина опустилась на каменный алтарь, поставив точку в этом сражении...`,
  `<svg viewBox="0 0 640 480" class="w-full h-full"><rect width="640" height="480" fill="#1c1917"/></svg>`
);

export const RAW_ART_R03_TORIN = buildPartyArtEml(
  {
    from: 'Anna (Artist) <anna@player.local>',
    to: 'Campaign Vault <vault@chronicle.local>',
    subject: '[Art Asset] Торин добивает шамана у алтаря',
    messageId: '<art-r03-torin-kill@vault.local>',
    targetRound: 3,
    assetType: 'Illustration',
  },
  {
    artist_credit: 'Анна (Эльф-Следопыт)',
    caption: 'Торин наносит решающий удар по алтарю',
    book_placement: 'FullPageSpread',
    link_to_scene_id: 'round-03-resolution@vault.local',
  }
);

// Historical Round 1 & Round 2 Capsules for comprehensive campaign archive
export const RAW_RESOLUTION_R01 = buildMasterResolutionEml(
  {
    from: 'Dungeon Master <dm@chronicle.local>',
    to: 'Party <party@chronicle.local>',
    subject: '[Round 1] Resolution: Врата Забытого Склепа',
    messageId: '<round-01-resolution@vault.local>',
    round: 1,
  },
  {
    round: 1,
    combat_status: 'Ongoing',
    entities: [
      { id: 'char_warrior', hp: 32, max_hp: 32, pos: [4, 6] },
      { id: 'char_wizard_elena', hp: 16, max_hp: 16, pos: [2, 2] }
    ],
    mechanical_log: [
      'Torin kicks down the ancient iron gate.',
      'Elena casts Light on Torin shield.',
      'Goblin scouts alerted in darkness.'
    ]
  },
  `Тяжелые кованые петли заскрипели под натиском стального наплечника Торина. Сноп искр озарил вековую паутину, за которой в глубине коридора блеснули голодные желтые глаза дозорных...`
);

export const RAW_RESOLUTION_R02 = buildMasterResolutionEml(
  {
    from: 'Dungeon Master <dm@chronicle.local>',
    to: 'Party <party@chronicle.local>',
    subject: '[Round 2] Resolution: Танец Клинков в Тени',
    messageId: '<round-02-resolution@vault.local>',
    round: 2,
  },
  {
    round: 2,
    combat_status: 'Ongoing',
    entities: [
      { id: 'char_warrior', hp: 28, max_hp: 32, pos: [8, 7] },
      { id: 'char_wizard_elena', hp: 14, max_hp: 16, pos: [2, 3] },
      { id: 'mob_shaman', hp: 26, max_hp: 28, pos: [12, 8] }
    ],
    mechanical_log: [
      'Torin engages frontliners, taking 4 glancing damage.',
      'Elena dodges a poisoned arrow.'
    ]
  },
  `Свист стрел рассек холодный воздух усыпальницы. Торин принял на щит удар зазубренного кинжала, в то время как шаман на возвышении начал монотонно речитативить некромантический заговор...`
);

export const INITIAL_EML_VAULT: EmlMessage[] = [
  parseEmlString(RAW_INTENT_R03_ELENA),
  parseEmlString(RAW_RESOLUTION_R03),
  parseEmlString(RAW_ART_R03_TORIN),
  parseEmlString(RAW_RESOLUTION_R01),
  parseEmlString(RAW_RESOLUTION_R02),
];

export const INITIAL_CHAPTERS: Chapter[] = [
  {
    round: 1,
    title: 'Глава I. Врата Забытого Склепа',
    subtitle: 'Начало спуска в глубины пепельной усыпальницы Одинокого Пика',
    prose: `Тяжелые кованые петли заскрипели под натиском стального наплечника Торина. Сноп ослепительных искр брызнул во тьму, озарив вековую паутину, за которой в глубине коридора блеснули голодные желтые глаза дозорных. Древний склеп встретил искателей приключений могильным холодом и спертым воздухом, пропитанным веками забвения и горьким запахом сырой земли.

Каменные плиты пола под ногами были покрыты тонким слоем вековой сажи. На стенах едва различимо мерцали барельефы забытых королей севера, чьи лики были намеренно осквернены и сколоты грубыми орочьими зубилами. Впереди, сквозь гулкую тишину подземелья, доносился тревожный шорох когтей и тихое, захлебывающееся шипение гоблинских дозорных, спешно взводящих тетивы коротких луков.

Торин на мгновение замер у порога, перехватив поудобнее рукоять двуручного клинка. Сталь гербового наплечника с изображением Одинокого Пика тихо звякнула о кольчугу. Позади него Елена уже шептала начальные слова пробуждающего арканного обряда, сплетая пальцы в геометрические узлы первой сферы.`,
    prosePage2: `Вспышка мягкого лазурного света сорвалась с кончиков пальцев волшебницы, очертив контуры арочного свода и обнажив три корявые фигуры, притаившиеся за полуразрушенным саркофагом жреца. Гоблины взвизгнули от неожиданной иллюминации, ослепленные чистой магией эльфийских школ.

— Они здесь! — раздался резкий, сдержанный возглас Торина, эхом раскатившийся по сводам гробницы. — Держите строй, не позволяйте им обойти нас по боковым нишам!

Первая стрела с глухим стуком вонзилась в массивный дубовый брус дверного косяка всего в дюйме от плеча воина, оставив за собой тонкий след ядовито-зеленой слизи. Битва за древнюю крипту началась без предупреждения и пощады.`,
    roleplayQuotes: [
      {
        actorName: 'Торин (Воин)',
        actorClass: 'Воин 3 ур. • Щитоносец Одинокого Пика',
        speech: 'Держитесь строго за моим щитом! Здесь пахнет засадой и могильным ядом!',
        thought: 'Если петли не выдержат напора, нас зажмут в узком дверном проеме...',
        flavor: 'Торин с силой выставляет вперед щит с гербом Одинокого Пика, блокируя проход.',
        emotion: 'calm',
      },
      {
        actorName: 'Елена (Волшебница)',
        actorClass: 'Волшебница 3 ур. • Орден Тлеющего Ока',
        speech: 'Вижу троих у дальнего саркофага! Освещаю сектор, приготовьтесь к залпу!',
        thought: 'Главное — сберечь фокус-кристалл от шальных рикошетов.',
        flavor: 'Елена поднимает посох, лазурное кольцо света охватывает свод склепа.',
        emotion: 'focused',
      },
    ],
    battleLogSummary: [
      'Торин выбивает древние базальтовые ворота (Атлетика d20+5 = 19)',
      'Елена активирует арканное сияние чар (Light Cantrip)',
      'Гоблинские лучники застигнуты врасплох на дистанции 35 футов',
      'Инициатива: Торин 18, Елена 14, Дозорные 11',
    ],
    artworks: [
      {
        title: 'Вход в Пепельную Крипту',
        artist: 'Анна (Художник партии)',
        url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
        placement: 'ChapterHeader',
        caption: 'Рис. 1.1. Древние базальтовые врата склепа. Оригинал акварели: @Anna_Ranger (300 DPI)',
      },
    ],
    masterNotes: 'Склеп был запечатан во времена Третьей Эпохи. На полу заметны следы недавнего осквернения ритуальной кровью. Любой персонаж с Пассивным Вниманием 12+ замечает нажимные плиты ловушек.',
    lootReward: {
      xp: 150,
      coins: '18 серебряных монет эпохи Валора',
      items: ['Факел вечного пламени (Uncommon)', 'Осколок базальтовой печати'],
    },
    loreSnippet: {
      title: 'Тайны Ордена Одинокого Пика',
      text: 'Рыцари Пика давали клятву удерживать некромантические разломы северного хребта ценой собственной плоти и духа.',
    },
  },
  {
    round: 2,
    title: 'Глава II. Танец Клинков в Тени',
    subtitle: 'Ожесточенное столкновение у надгробий древних жрецов',
    prose: `Свист отравленных стрел рассек морозный воздух усыпальницы. Торин молниеносно вскинул щит, приняв на полированную сталь коварный выпад зазубренного клинка передового гоблина. Удар отозвался звонким металлическим лязгом, рассыпая в полумраке сноп желтых искр. 

В то же мгновение на дальнем возвышении у почерневшего каменного алтаря зашевелилась сгорбленная фигура в лохмотьях из шкур пещерного медведя. Гоблинский шаман вскинул над головой костяной посох, увенчанный расколотым черепом вепря, и затянул скрипучий, утробный заговор на мертвом наречии теней. Воздух вокруг алтаря ощутимо сгустился, наливаясь тяжелым запахом озона и горящей серы.

Тени на сводчатых стенах ожили, вытягивая костлявые пальцы к живым воинам. Из темных углов гробницы потянуло ледяным сквозняком потустороннего холода, гасящим отблески факелов.`,
    prosePage2: `Елена плавно скользнула в тень ближайшего надгробия, избегая прицельного выстрела вражеского стрелка. Ее пальцы уже вычерчивали в воздухе огненный символ руны Инферно. Магическая ткань пространства откликнулась мгновенно — упругая волна жара прокатилась по залу, заставив тени отпрянуть.

— Шаман начинает призыв бесов! — крикнула волшебница сквозь звон клинков. — Торин, свяжи боем авангард, я пробью его барьер!

Воин взревел боевой клич клана Одинокого Пика и сделал широкий выпад двуручным мечом, оттесняя наступающих врагов к массивной колонне. Каждый дюйм каменного пола приходилось отвоевывать с боем.`,
    roleplayQuotes: [
      {
        actorName: 'Елена (Волшебница)',
        actorClass: 'Волшебница 3 ур.',
        speech: 'Не дайте ему закончить призыв! Я накапливаю силу для палящего удара!',
        thought: 'Нужно беречь ячейки второго круга — шаман окружен духовным барьером.',
        flavor: 'Елена чертит в воздухе защитную руну, кончики ее пальцев светятся раскаленным золотом.',
        emotion: 'focused',
      },
      {
        actorName: 'Торин (Воин)',
        actorClass: 'Воин 3 ур.',
        speech: 'Вперед, твари! Ваша сталь тупа, как и ваши клыки!',
        thought: 'Если лучники обойдут слева, Елена останется без прикрытия.',
        flavor: 'Торин парирует выпад копейщика и мощным пинком отбрасывает его на саркофаг.',
        emotion: 'furious',
      },
    ],
    battleLogSummary: [
      'Торин парирует выпад авангарда (КД 18 против атаки 14 — промах)',
      'Торин наносит ответный рубящий удар: 11 урона гоблину-копейщику',
      'Елена успешно уклоняется от ядовитой стрелы лучника (Спасбросок Ловкости 17)',
      'Шаман завершает 1-й такт заклинания "Пепельное погребение"',
    ],
    artworks: [
      {
        title: 'Тени в Саркофагах',
        artist: 'Анна (Художник партии)',
        url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
        placement: 'Inline',
        caption: 'Рис. 2.1. Схватка в зале саркофагов древних жрецов. Автор: @Anna_Ranger',
      },
    ],
    masterNotes: 'Шаман использует окружение для полуукрытия (+2 к КД). Уничтожение ритуальных свечей на алтаре ослабит его барьер на 5 пунктов.',
    lootReward: {
      xp: 220,
      coins: '35 золотых дукатов в кошельке копейщика',
      items: ['Короткий лук из тиса +1 к урону ядом', 'Флакон противоядия (2 шт.)'],
    },
    loreSnippet: {
      title: 'Пепельные Шаманы Пустошей',
      text: 'Используют прах кремированных предков для создания иллюзорных двойников и обжигающих завес.',
    },
  },
  {
    round: 3,
    title: 'Глава III. Пепел на Алтаре',
    subtitle: 'Кульминация сражения и сокрушение пепельного шамана',
    prose: `Воздух в крипте задрожал от нарастающего гула и запаха едкого озона. Шаман гоблинов в экстазе вскинул костяной посох, раскрывая пасть в беззвучном вопле триумфа, но закончить заклинание ему было не суждено. Из-за каменного саркофага выступила Елена. 

Ее глаза полыхнули слепящим пламенем, а с ладоней сорвались три ослепительно ярких луча чистого огня — Scorching Ray. С оглушительным свистом лучи прорезали полумрак зала и с ювелирной точностью вонзились в грудь шамана и основание алтаря.

Взрыв разметал ритуальные кости и пепел во все стороны. Шаман покачнулся, объятый пламенем, выронив пылающий посох на древние плиты.`,
    prosePage2: `Секундой позже, не давая врагу опомниться, из дымовой завесы вынырнул Торин. Двуручный клинок воина, напитанный тяжестью векового гнева, со свистом описал дугу и с сокрушительной силой обрушился на черный алтарный монолит. 

Камень треснул с оглушительным грохотом, похожим на раскат грома под землей. Магический контур разорвался, осыпая зал дождем угасающих багровых искр. Шаман рухнул на колени и рассыпался серым пеплом, оставив на плитах лишь древний амулет.

Наступила мертвая, благоговейная тишина. Лишь тяжелое дыхание героев и потрескивание остывающего алтаря нарушали покой гробницы. Победа осталась за отрядом Одинокого Пика.`,
    roleplayQuotes: [
      {
        actorName: 'Елена (Волшебница)',
        actorClass: 'Волшебница 3 ур.',
        speech: 'Пепел к пеплу, тварь! Попробуй чистое пламя Инферно!',
        thought: 'Идеальное попадание всеми тремя лучами. Ритуал сорван!',
        flavor: 'Елена отступает в тень саркофага, на ладонях медленно угасает магический огонь.',
        emotion: 'furious',
      },
      {
        actorName: 'Торин (Воин)',
        actorClass: 'Воин 3 ур.',
        speech: 'За Одинокий Пик! Этот алтарь больше никогда не осквернит священную землю!',
        thought: 'Удар пришелся точно в стык ритуального камня. Путь свободен.',
        flavor: 'Торин с размаху вонзает двуручный клинок в основание алтаря, ломая его надвое.',
        emotion: 'triumphant',
      },
    ],
    battleLogSummary: [
      'Елена сотворяет Палящий Луч (Scorching Ray, 2-й круг): 3 луча (Крит 20, 18, 16)',
      'Суммарный урон огнем: 24 урона — преодолевает сопротивление цели',
      'Торин проводит атаку двуручным мечом по алтарю: 14 рубящего урона (Успех)',
      'Пепельный шаман повержен! Боевой контакт завершен убедительной победой партии!',
    ],
    artworks: [
      {
        title: 'Торин добивает шамана у алтаря',
        artist: 'Анна (Эльф-Следопыт)',
        url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
        placement: 'FullPageSpread',
        caption: 'Рис. 3.1. Решающий удар по алтарю пепла. Автор: @Anna_Ranger (300 DPI CMYK)',
      },
    ],
    masterNotes: 'Расколотый алтарь открыл скрытую нишу в полу, ведущую на нижний ярус Цитадели. В пепле обнаружен легендарный Посох Тлеющих Углей.',
    lootReward: {
      xp: 450,
      coins: '120 золотых дукатов, 4 рубина чистого огня',
      items: ['Посох Тлеющих Углей (Rare)', 'Амулет Пепельного Покрова (Uncommon)', 'Свиток Огненного Шара'],
    },
    loreSnippet: {
      title: 'Оскверненные Алтари Севера',
      text: 'Разрушение каждого такого алтаря ослабляет печать на Темных Вратах подгорного царства.',
    },
  },
  {
    round: 4,
    title: 'Глава IV. Тайны Глубинного Святилища',
    subtitle: 'Исследование нижнего яруса и расшифровка древних рун',
    prose: `Когда едкий дым рассеялся, герои увидели вскрытую нишу под расколотым алтарем. Каменные ступени, покрытые сияющим инеем, уходили круто вниз, во тьму неизведанных глубин подгорного царства. Оттуда веяло первозданной сыростью и забытой магией.

Торин зажег свежий факел, внимательно осматривая стены прохода. На полированном базальте проступали древние руны двергов, повествующие о великом запечатывании Темного Разлома пять сотен лет назад.

Елена опустилась на одно колено возле останков шамана, бережно поднимая зачерненный посох с незатухающим багровым кристаллом в навершии. Посох пульсировал теплом, отзываясь на прикосновение истинной волшебницы.`,
    prosePage2: `— Этот посох принадлежал архимагу Калебу, — тихо произнесла Елена, разглядывая гравировку на рукояти. — Он пал здесь во время осады, и его оружие было осквернено. Теперь мы вернули его свету.

Торин одобрительно кивнул, перевязывая плечо чистым льняным бинтом. Раны горели, но дух воина был крепок как никогда. Впереди отряд ждали новые испытания, но первая победа в склепе сплотила их крепче стали.

Отряд сделал короткий привал у ступеней, готовясь к спуску в сердце Одинокого Пика.`,
    roleplayQuotes: [
      {
        actorName: 'Торин (Воин)',
        actorClass: 'Воин 3 ур.',
        speech: 'Перевяжем раны и двинемся дальше. Внизу слышен гул подземной реки.',
        thought: 'Надо проверить крепость доспеха перед спуском.',
        flavor: 'Торин подтягивает ремни кирасы и достает флягу с горной водой.',
        emotion: 'calm',
      },
      {
        actorName: 'Елена (Волшебница)',
        actorClass: 'Волшебница 3 ур.',
        speech: 'Руны на ступенях предупреждают о стражах-автоматонах. Будь начеку.',
        thought: 'Сила посоха восстановит мои заклинания огня.',
        flavor: 'Елена проводит пальцами по рунической надписи на стене.',
        emotion: 'focused',
      },
    ],
    battleLogSummary: [
      'Короткий отдых: Торин восстанавливает 8 ХП (Кость Хитов 1d10+2 = 8)',
      'Елена идентифицирует Посох Тлеющих Углей (Аттьюнмент завершен)',
      'Обнаружен тайный проход на нижний уровень гробницы',
    ],
    artworks: [
      {
        title: 'Спуск в Глубинное Святилище',
        artist: 'Анна (Художник партии)',
        url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
        placement: 'ChapterHeader',
        caption: 'Рис. 4.1. Вход на нижний ярус склепа. Автор: @Anna_Ranger',
      },
    ],
    masterNotes: 'Спуск ведет к подземному акведуку древних гномов. В следующем раунде возможна встреча с механическими стражами.',
    lootReward: {
      xp: 200,
      coins: '45 серебряных монет, слиток черной меди',
      items: ['Древняя карта нижнего яруса', 'Зелье лечения (2d4+2)'],
    },
    loreSnippet: {
      title: 'Подгорный Акведук',
      text: 'Инженерное чудо древней цивилизации, снабжавшее водой всю крепость Одинокого Пика.',
    },
  },
];

export const INITIAL_BESTIARY: BestiaryEntry[] = [
  {
    id: 'mob_shaman',
    name: 'Гоблинский Пепельный Шаман',
    type: 'Гуманоид (гоблиноид), нейтрально-злой',
    challengeRating: '2 (450 XP)',
    ac: 13,
    hp: 28,
    speed: '30 фт.',
    stats: { str: 8, dex: 14, con: 12, int: 10, wis: 16, cha: 8 },
    abilities: [
      {
        name: 'Пепельное укрытие',
        desc: 'При получении урона огнем шаман создает облако дыма радиусом 10 фт., дающее ему полуукрытие.',
      },
    ],
    actions: [
      {
        name: 'Костяной посох',
        desc: 'Рукопашная атака оружием: +4 к попаданию, досягаемость 5 фт., урон 1d6+2 дробящий плюс 1d6 некротический.',
      },
      {
        name: 'Пламя Бездны (Перезарядка 5-6)',
        desc: 'Шаман выпускает конус пепла на 15 фт. Все существа делают спасбросок Ловкости СЛ 13, получая 3d6 урона огнем.',
      },
    ],
    lore: 'Шаманы пепельных кланов заключают пакты с духами погребальных костров, питая свою магию прахом павших воинов.',
    illustrationUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80',
    artistCredit: 'Анна (Эльф-Следопыт)',
  },
  {
    id: 'mob_archer',
    name: 'Пепельный Дозорный Лучник',
    type: 'Гуманоид (гоблиноид), хаотично-злой',
    challengeRating: '1/2 (100 XP)',
    ac: 13,
    hp: 14,
    speed: '30 фт.',
    stats: { str: 10, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
    abilities: [
      {
        name: 'Проворный побег',
        desc: 'Лучник может совершить действие Отход или Засада бонусным действием в каждый свой ход.',
      },
    ],
    actions: [
      {
        name: 'Короткий лук',
        desc: 'Дальнобойная атака оружием: +4 к попаданию, дистанция 80/320 фт., урон 1d6+2 колющий.',
      },
    ],
    lore: 'Оснащенные смазанными пеплом стрелами, эти лучники прячутся в нишах усыпальниц.',
    illustrationUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80',
    artistCredit: 'Анна (Эльф-Следопыт)',
  },
];

export const INITIAL_GRIMOIRE: GrimoireItem[] = [
  {
    id: 'item_staff_cinders',
    name: 'Посох Тлеющих Углей',
    itemType: 'Волшебный посох',
    rarity: 'Rare',
    attunement: true,
    description: 'Резной посох из обугленного дуба, навершие которого удерживает незатухающий уголь из первородного огня.',
    properties: [
      '+1 к броскам заклинаний стихии огня',
      'Позволяет тратить 1 заряд для наложения Scorching Ray без траты ячейки (3 заряда в день)',
    ],
    history: 'Создан архимагом Калебом во время осады Базальтовой Цитадели.',
    illustrationUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'item_amulet_veil',
    name: 'Амулет Пепельного Покрова',
    itemType: 'Амулет',
    rarity: 'Uncommon',
    attunement: false,
    description: 'Серебряный медальон с гравировкой перекрещенных костей.',
    properties: ['Дает сопротивление урону от некротической магии и холода в подземельях.'],
    history: 'Трофей, снятый с побежденного шамана в крипте.',
    illustrationUrl: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=500&auto=format&fit=crop&q=80',
  },
];

export const INITIAL_AUDIO_TRACKS: AudioTrackSegment[] = [
  {
    id: 'track-01',
    round: 1,
    type: 'dungeon_intro',
    speakerName: 'System / Ambience',
    speakerRole: 'System',
    title: 'Вступление: Орган крипты и падение врат',
    durationSec: 4.5,
    waveformSeed: 42,
    sfxType: 'dungeon_intro',
    textSnippet: 'Мрачный хор усыпальницы и глухой удар по железным петлям...',
  },
  {
    id: 'track-02',
    round: 1,
    type: 'master_narration',
    speakerName: 'Dungeon Master',
    speakerRole: 'DM',
    title: 'Мастер: Описание входа в склеп',
    durationSec: 9.2,
    waveformSeed: 88,
    textSnippet: 'Тяжелые кованые петли заскрипели под натиском стального наплечника Торина...',
  },
  {
    id: 'track-03',
    round: 3,
    type: 'character_speech',
    speakerName: 'Elena (Wizard)',
    speakerRole: 'Player',
    title: 'Елена: Боевой клич заклинательницы',
    durationSec: 3.8,
    waveformSeed: 124,
    textSnippet: 'Пепел к пеплу, тварь! Попробуй это пламя!',
  },
  {
    id: 'track-04',
    round: 3,
    type: 'sound_fx',
    speakerName: 'Sound FX',
    speakerRole: 'System',
    title: 'Звук заклинания: Scorching Ray (3 луча)',
    durationSec: 2.1,
    waveformSeed: 301,
    sfxType: 'fire_spell',
    textSnippet: 'Шипение озона и тройной огненный взрыв по алтарю...',
  },
  {
    id: 'track-05',
    round: 3,
    type: 'character_speech',
    speakerName: 'Torin (Warrior)',
    speakerRole: 'Player',
    title: 'Торин: Решающий удар секиры',
    durationSec: 4.0,
    waveformSeed: 512,
    sfxType: 'sword_slash',
    textSnippet: 'За Одинокий Пик! Этот алтарь больше не осквернит землю!',
  },
  {
    id: 'track-06',
    round: 3,
    type: 'master_narration',
    speakerName: 'Dungeon Master',
    speakerRole: 'DM',
    title: 'Мастер: Эпилог раунда и тишина победы',
    durationSec: 8.5,
    waveformSeed: 911,
    textSnippet: 'Секундой позже секира Торина опустилась на алтарь, поставив точку в этом сражении...',
  },
];
