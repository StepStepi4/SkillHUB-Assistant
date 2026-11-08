/* ============================================================
 *  Загальна конфігурація застосунку SkillHUB
 *  Єдине місце, де вказано адресу API (Google Apps Script).
 * ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycby_nAJWSS9UNkbNBqzIMZkOlLhT95TurgEngwjgptTlFTDxGw6NYkj4-ASTTQydQ5Ou8w/exec';

// Єдине локальне сховище (IndexedDB) для обох розділів
const IDB_NAME = 'skillhub_store';
const IDB_STORE = 'kv';

// Кнопки з таблиці вказують іконку ім'ям файлу з цієї папки
const SKILLHUB_ICONS_DIR = 'assets/icons/skillhub/';
