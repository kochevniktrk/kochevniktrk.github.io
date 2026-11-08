// Настройки заведения. После передачи хозяевам меняется только этот файл (и таблица).
export const CONFIG = {
  name: 'Кочевник',
  slogan: 'Осторожно! Очень вкусно!',
  place: 'Теренколь · Халал',
  whatsapp: '77052133394',
  phone: '+77052133394',
  instagram: 'https://www.instagram.com/kochevnik.trk/',
  // Ссылка на опубликованную Google Таблицу (Файл → Поделиться → Опубликовать в интернете → CSV).
  // Пусто — сайт берёт вшитое меню из menu-data.js.
  // Таблица «Меню Кочевник (сайт)» на kochevniktrk@gmail.com, лист «Меню».
  sheetCsvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5o4h-MLLTBieuqYEca6KbJLoYIEKEQQWgQHRmTgz_phM-QI6lT48Nvr8yt-yZLUDjWry7jsNkdy4/pub?gid=0&single=true&output=csv',
  // Блюда, которые разлетаются в блоке «Хит»: название как в таблице + набор слоёв из js/layers.js.
  heroDishes: [
    { dish: 'Бургер говядина', layers: 'burger', label: 'Бургер' },
    { dish: 'Донер', layers: 'doner', label: 'Донер' },
  ],
};
