BY MAXTRADE d.o.o. - site "Age of Sail", Slovenian + English (package of 7 Oct 2026, update 2)

RU: Сначала откройте 01_INSTRUCTION_RU.docx - там пошаговая инструкция по размещению на maxtrade.si и раздел 2 "Как быстро менять тексты".
    Папка site - готовый двуязычный сайт: её содержимое нужно выложить на хостинг (статические файлы, сборка не нужна).
    Перед публикацией вставьте ключ Web3Forms в site/config.js (строка: key: '',) - один файл для обеих версий.
    02_SI_TEXTS_FOR_PROOFREADING.docx - словенские тексты рядом с английскими, для проверки носителем языка.

EN: Open 01_INSTRUCTION_RU.docx first (a short English quick start is at the end of the document).
    The folder "site" is the ready-to-publish static website: upload its contents to the web root of a static host.
    Slovenian is the main language (/), English is at /en/; privacy pages at /zasebnost/ and /en/privacy/.
    Before publishing, paste a Web3Forms access key into site/config.js (line: key: '',) - one file for both languages.
    Do not change MX/TXT DNS records (mail). Do not embed the page into Weblium.
    Have the Slovenian text read by a native speaker (02_SI_TEXTS_FOR_PROOFREADING.docx) and the privacy policy by a lawyer.

IMPORTANT / ВАЖНО: do not open site/index.html on its own (double-click, phone file manager, WhatsApp) - without the neighbouring folders assets/ and config.js it shows an unstyled page.
    Не открывайте index.html одиночным файлом (двойной клик, файловый менеджер телефона, WhatsApp): без соседних папок страница выглядит без оформления.
    Для просмотра: выложите папку site на хостинг, либо в папке site выполните  python -m http.server 8000  и откройте http://localhost:8000/

EDITING TEXT (quick): every page is a small readable file - site/index.html (Slovenian) and site/en/index.html (English).
    Open it in a code editor (not Word), Ctrl+F, change the words between the tags, save as UTF-8, publish.
    Texts used by scripts (film chapter names, map labels, form messages, WhatsApp first message): the commented
    "window.MTL = { ... }" block at the top of the same file. Address for enquiries / WhatsApp number / form key: site/config.js.
    Colours and sizes: site/assets/css/style.css. Pictures: site/assets/img/.

site/index.html             Slovenian page (text and markup only)
site/en/index.html          English page
site/zasebnost/, site/en/privacy/   privacy policy (SI / EN)
site/config.js              settings: Web3Forms key, e-mail address, WhatsApp number
site/assets/css/            style.css (site), privacy.css (privacy pages)
site/assets/js/             page.js, form.js, film.js (3D voyage), three.min.js (three.js r128, MIT)
site/assets/img/            pictures, logos, icons, share image
site/assets/fonts/          fonts (SIL OFL, with added c/s/z with caron), fonts.css
site/assets/LICENSES.txt, site/robots.txt, sitemap.xml, _headers

Обновление 28.10.2026: на плантации ярусные кусты арабики и теневые деревья-зонтики; на телефонах картинка в 2,5 раза плотнее (резче), тени мягче и детальнее. Также перенесены доработки 25.10: на складе не рисуются невидимые внутренние мешки, тени на телефоне обновляются раз в три кадра; в подвале полное название BY MAXTRADE d.o.o. Изменены: site/assets/js/film.js и подвал в index.html, en/index.html, страницах политики.
