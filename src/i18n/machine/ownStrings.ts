// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The sentences the on-device tier must not garble (2026-10-10): the ones that describe the tier
// itself — the Language menu's "Auto-translated" section, its heading's tip, its rows' tips, the lines
// under the menu (settings.machine.*) — and the notice that a device language is held
// (autoFlip.language-held.*).
//
// Why these are translated here, once, carefully, instead of by the device: a test run through a
// browser's on-device translator (en→fr, 2026-10-10) turned the disclosure into the opposite of
// itself. "Some wording may be off; anything not yet translated shows in English" came back as
// "Certaines formulations peuvent être désactivées ; Tout ce qui n'est pas encore traduit en
// anglais" — wording that may be SWITCHED
// OFF, and everything not yet translated INTO English — and the cache tip as "Il ne peut plus se
// traduire ici" (it can no longer translate ITSELF). A disclosure is the one sentence whose whole
// job is to be believed about what the reader is looking at; a machine can't be trusted with the
// sentence that says how far to trust the machine. So for these keys a candidate language reads
// what is below, never the device's output.
//
// What every entry must say (the English comments in i18n/en/settings.ts and en/autoFlip.ts have
// the reasons, and they bind these as much as the English):
//   - machine-translated ON THIS DEVICE; some wording may be inaccurate — "off" as in imprecise,
//     never as in disabled, which is exactly where that run broke;
//   - anything not yet translated is SHOWN in English — never "translated into English";
//   - a held choice is KEPT, not cleared, and comes back by itself;
//   - no browser, company or product is named, in any language;
//   - the held notice names no language as the fallback: "its usual language" covers both the
//     reader's browser language and English, because it can't know which it is read in.
//
// How they are written, language by language:
//   - Register: the natural one for software in that language, as the shipped catalogs chose
//     theirs (German du, Spanish tú; Russian and Turkish formal). Informal where that is the norm —
//     it (tu), nl (je), pl, hu, fi, da, sv, no, vi (bạn); formal where that is — fr (vous), cs,
//     sk, ro, bg, uk, el, hr, id (Anda), hi (आप); polite and pronoun-light in ja, ko, zh, th.
//   - A placeholder is never inflected (restructure the sentence instead). {language}
//     is a language's own name — often not this language's word for it, and capitalised as its own
//     speakers write it — so a case ending, an elision or an article chosen by its first letter
//     would be wrong half the time. It stands beside a noun that takes the case instead ("języka
//     {language}", "kieltä {language}", "{language} 언어로"), after a preposition that doesn't
//     change it, or after a colon (hu failed). {route} is a path of three screen labels; it sits
//     after "go to"/"open" or in apposition to a noun ("v nabídce {route}", "το μενού {route}",
//     "przejdź do: {route}"), never in a case of its own.
//   - The percent sign follows Intl.NumberFormat(lang, { style: 'percent' }): a no-break space
//     before it (written \u00a0, so it can be seen) in fr, cs, sk, ro, hr, da, sv, no and fi; none
//     elsewhere. French also takes one before its semicolon.
//   - Punctuation is each script's own: the Greek semicolon is the ano teleia (·) — a ";" reads as
//     a question mark there; Chinese uses the full-width "；"; Japanese and Thai have no semicolon
//     (a full stop, and a space, which is how Thai separates sentences); Hindi ends on the danda (।).
//   - The section heading (2026-10-10, renamed from "Translated on this device", which readers could
//     not tell from the section above it) is the language's own short heading for machine
//     translation — a noun phrase where that reads better than a participle — because it heads a
//     narrow menu. Its tip (sectionHint) carries the difference: "above" ships with the app, "below"
//     is translated by this device. AstroLina is never inflected: where a case would fall on it, the
//     sentence makes it the subject ("AstroLina sisältää…") or sets it beside "app" ("aplikace
//     AstroLina", "z aplikacją AstroLina").
//
// Every entry keeps the English's {placeholders}, each exactly once, and nothing else in braces —
// t() rejects a template whose names differ from English, and so does verify:i18n-machine. When an
// English sentence below changes, OWN_STRINGS_SOURCE stops matching the catalog: retranslate the key
// in every language here, then copy the new English into OWN_STRINGS_SOURCE.

/** The English each translation below was made from, as it stood on 2026-10-10. Kept beside the
 *  translations, not imported from the catalog, so the two can be compared: where the catalog's
 *  English no longer equals this, the translations of that key are stale and must not be shown. */
export const OWN_STRINGS_SOURCE: Record<string, string> = {
  'settings.machine.section': 'Auto-translated',
  'settings.machine.sectionHint':
    'The languages above come with AstroLina. The languages below will be translated automatically on this device.',
  'settings.machine.hint': 'Translated from English on this device, as you use the app. Some wording may be off.',
  'settings.machine.downloadHint':
    'Translated from English on this device. The first time, the translation model is downloaded to it.',
  'settings.machine.partialHint':
    'Part of the app is still in English. Choose it again to finish downloading the translation to this device.',
  'settings.machine.heldDownloadHint':
    'Your choice, on hold until the translation is downloaded to this device again. Choose it to download it.',
  'settings.machine.heldHint':
    'This device can’t translate into this language right now. Your choice is kept, and comes back when it can.',
  'settings.machine.cacheHint':
    'Shown from what this device translated before. It can’t translate here any more, so new text stays in English.',
  'settings.machine.downloading': 'Downloading {language} to this device… {percent}%',
  'settings.machine.translating': 'Translating into {language}…',
  'settings.machine.failed': '{language} couldn’t be set up on this device.',
  'settings.machine.disclosure':
    'Machine-translated on this device. Some wording may be off; anything not yet translated shows in English.',
  'autoFlip.language-held.title': 'Your chosen language is on hold',
  'autoFlip.language-held.body':
    'The language you chose is translated on this device, which isn’t possible here right now, so the app is shown in its usual language. Your choice is kept, not cleared. To choose another language, use {route}.',
};

/** Per candidate language (i18n/machineMenu MACHINE_CANDIDATES, by the same codes), the careful
 *  translation of every key in OWN_STRINGS_SOURCE. */
export const OWN_STRINGS: Record<string, Record<string, string>> = {
  fr: {
    'settings.machine.section': 'Traduction automatique',
    'settings.machine.sectionHint':
      'Les langues ci-dessus sont fournies avec AstroLina. Les langues ci-dessous seront traduites automatiquement sur cet appareil.',
    'settings.machine.hint':
      'Traduit de l’anglais sur cet appareil, à mesure que vous utilisez l’application. Certaines formulations peuvent être approximatives.',
    'settings.machine.downloadHint':
      'Traduit de l’anglais sur cet appareil. La première fois, le modèle de traduction y est téléchargé.',
    'settings.machine.partialHint':
      'Une partie de l’application est encore en anglais. Choisissez de nouveau cette langue pour terminer le téléchargement de la traduction sur cet appareil.',
    'settings.machine.heldDownloadHint':
      'Votre choix, en attente jusqu’à ce que la traduction soit de nouveau téléchargée sur cet appareil. Choisissez cette langue pour lancer le téléchargement.',
    'settings.machine.heldHint':
      'Cet appareil ne peut pas traduire dans cette langue pour le moment. Votre choix est conservé et reviendra dès que l’appareil le pourra.',
    'settings.machine.cacheHint':
      'Affiché d’après ce que cet appareil a traduit auparavant. L’appareil ne peut plus traduire ici, donc les nouveaux textes restent en anglais.',
    'settings.machine.downloading': 'Téléchargement de la langue {language} sur cet appareil… {percent}\u00a0%',
    'settings.machine.translating': 'Traduction en {language}…',
    'settings.machine.failed': 'Impossible de configurer {language} sur cet appareil.',
    'settings.machine.disclosure':
      'Traduit automatiquement sur cet appareil. Certaines formulations peuvent être approximatives\u00a0; tout ce qui n’est pas encore traduit s’affiche en anglais.',
    'autoFlip.language-held.title': 'Votre choix de langue est en attente',
    'autoFlip.language-held.body':
      'La langue que vous avez choisie est traduite sur cet appareil, ce qui n’est pas possible ici pour le moment, si bien que l’application s’affiche dans sa langue habituelle. Votre choix est conservé, et non effacé. Pour choisir une autre langue, allez dans {route}.',
  },
  it: {
    'settings.machine.section': 'Traduzione automatica',
    'settings.machine.sectionHint':
      'Le lingue qui sopra sono incluse in AstroLina. Le lingue qui sotto verranno tradotte automaticamente su questo dispositivo.',
    'settings.machine.hint':
      'Tradotto dall’inglese su questo dispositivo, man mano che usi l’app. Alcune formulazioni potrebbero essere imprecise.',
    'settings.machine.downloadHint':
      'Tradotto dall’inglese su questo dispositivo. La prima volta, il modello di traduzione viene scaricato sul dispositivo.',
    'settings.machine.partialHint':
      'Una parte dell’app è ancora in inglese. Scegli di nuovo questa lingua per completare il download della traduzione su questo dispositivo.',
    'settings.machine.heldDownloadHint':
      'La tua scelta, in sospeso finché la traduzione non sarà di nuovo scaricata su questo dispositivo. Scegli questa lingua per avviare il download.',
    'settings.machine.heldHint':
      'Al momento questo dispositivo non può tradurre in questa lingua. La tua scelta resta salvata e tornerà attiva quando sarà possibile.',
    'settings.machine.cacheHint':
      'Mostrato in base a ciò che questo dispositivo ha tradotto in precedenza. Qui non può più tradurre, quindi i nuovi testi restano in inglese.',
    'settings.machine.downloading': 'Download di {language} su questo dispositivo… {percent}%',
    'settings.machine.translating': 'Traduzione in {language}…',
    'settings.machine.failed': 'Impossibile configurare {language} su questo dispositivo.',
    'settings.machine.disclosure':
      'Tradotto automaticamente su questo dispositivo. Alcune formulazioni potrebbero essere imprecise; tutto ciò che non è ancora tradotto viene mostrato in inglese.',
    'autoFlip.language-held.title': 'La lingua che hai scelto è in sospeso',
    'autoFlip.language-held.body':
      'La lingua che hai scelto viene tradotta su questo dispositivo, cosa che qui al momento non è possibile, quindi l’app è mostrata nella sua lingua abituale. La tua scelta è conservata, non cancellata. Per scegliere un’altra lingua, vai in {route}.',
  },
  nl: {
    'settings.machine.section': 'Automatisch vertaald',
    'settings.machine.sectionHint':
      'De talen hierboven worden meegeleverd met AstroLina. De talen hieronder worden automatisch vertaald op dit apparaat.',
    'settings.machine.hint':
      'Vertaald uit het Engels op dit apparaat, terwijl je de app gebruikt. Sommige formuleringen kloppen misschien niet helemaal.',
    'settings.machine.downloadHint':
      'Vertaald uit het Engels op dit apparaat. De eerste keer wordt het vertaalmodel naar dit apparaat gedownload.',
    'settings.machine.partialHint':
      'Een deel van de app is nog in het Engels. Kies deze taal opnieuw om het downloaden van de vertaling naar dit apparaat af te ronden.',
    'settings.machine.heldDownloadHint':
      'Je keuze, in de wacht tot de vertaling opnieuw naar dit apparaat is gedownload. Kies deze taal om het downloaden te starten.',
    'settings.machine.heldHint':
      'Dit apparaat kan op dit moment niet naar deze taal vertalen. Je keuze blijft bewaard en komt terug zodra dat weer kan.',
    'settings.machine.cacheHint':
      'Getoond op basis van wat dit apparaat eerder heeft vertaald. Het kan hier niet meer vertalen, dus nieuwe tekst blijft in het Engels.',
    'settings.machine.downloading': '{language} wordt naar dit apparaat gedownload… {percent}%',
    'settings.machine.translating': 'Vertalen naar {language}…',
    'settings.machine.failed': '{language} kon niet worden ingesteld op dit apparaat.',
    'settings.machine.disclosure':
      'Automatisch vertaald op dit apparaat. Sommige formuleringen kloppen misschien niet helemaal; alles wat nog niet is vertaald, wordt in het Engels getoond.',
    'autoFlip.language-held.title': 'Je gekozen taal staat in de wacht',
    'autoFlip.language-held.body':
      'De taal die je hebt gekozen wordt op dit apparaat vertaald, en dat is hier nu niet mogelijk. Daarom wordt de app in de gebruikelijke taal getoond. Je keuze blijft bewaard en is niet gewist. Ga naar {route} om een andere taal te kiezen.',
  },
  pl: {
    'settings.machine.section': 'Tłumaczone automatycznie',
    'settings.machine.sectionHint':
      'Powyższe języki są dostarczane z aplikacją AstroLina. Poniższe języki będą tłumaczone automatycznie na tym urządzeniu.',
    'settings.machine.hint':
      'Tłumaczone z angielskiego na tym urządzeniu w miarę korzystania z aplikacji. Niektóre sformułowania mogą być nieprecyzyjne.',
    'settings.machine.downloadHint':
      'Tłumaczone z angielskiego na tym urządzeniu. Za pierwszym razem na urządzenie pobierany jest model tłumaczenia.',
    'settings.machine.partialHint':
      'Część aplikacji jest jeszcze po angielsku. Wybierz ten język ponownie, aby dokończyć pobieranie tłumaczenia na to urządzenie.',
    'settings.machine.heldDownloadHint':
      'Twój wybór, wstrzymany do czasu ponownego pobrania tłumaczenia na to urządzenie. Wybierz ten język, aby rozpocząć pobieranie.',
    'settings.machine.heldHint':
      'To urządzenie nie może teraz tłumaczyć na ten język. Twój wybór zostaje zachowany i wróci, gdy będzie to możliwe.',
    'settings.machine.cacheHint':
      'Wyświetlane na podstawie tego, co to urządzenie przetłumaczyło wcześniej. Nie może już tu tłumaczyć, więc nowy tekst pozostaje po angielsku.',
    'settings.machine.downloading': 'Pobieranie języka {language} na to urządzenie… {percent}%',
    'settings.machine.translating': 'Tłumaczenie na język {language}…',
    'settings.machine.failed': 'Nie udało się skonfigurować języka {language} na tym urządzeniu.',
    'settings.machine.disclosure':
      'Przetłumaczono maszynowo na tym urządzeniu. Niektóre sformułowania mogą być nieprecyzyjne; wszystko, czego jeszcze nie przetłumaczono, jest wyświetlane po angielsku.',
    'autoFlip.language-held.title': 'Wybrany język jest wstrzymany',
    'autoFlip.language-held.body':
      'Wybrany język jest tłumaczony na tym urządzeniu, co nie jest tu teraz możliwe, więc aplikacja jest wyświetlana w swoim zwykłym języku. Twój wybór został zachowany, a nie usunięty. Aby wybrać inny język, przejdź do: {route}.',
  },
  cs: {
    'settings.machine.section': 'Automatický překlad',
    'settings.machine.sectionHint':
      'Výše uvedené jazyky jsou součástí aplikace AstroLina. Níže uvedené jazyky se budou automaticky překládat v tomto zařízení.',
    'settings.machine.hint':
      'Překládáno z angličtiny v tomto zařízení, průběžně při používání aplikace. Některé formulace nemusí být přesné.',
    'settings.machine.downloadHint':
      'Překládáno z angličtiny v tomto zařízení. Napoprvé se do zařízení stáhne model pro překlad.',
    'settings.machine.partialHint':
      'Část aplikace je stále v angličtině. Vyberte tento jazyk znovu a dokončete stažení překladu do tohoto zařízení.',
    'settings.machine.heldDownloadHint':
      'Vaše volba, pozastavená, dokud se překlad znovu nestáhne do tohoto zařízení. Vyberte tento jazyk a spusťte stahování.',
    'settings.machine.heldHint':
      'Toto zařízení teď nedokáže překládat do tohoto jazyka. Vaše volba zůstává zachována a vrátí se, až to bude možné.',
    'settings.machine.cacheHint':
      'Zobrazeno z toho, co toto zařízení přeložilo dříve. Zde už překládat nemůže, takže nový text zůstává v angličtině.',
    'settings.machine.downloading': 'Stahování jazyka {language} do tohoto zařízení… {percent}\u00a0%',
    'settings.machine.translating': 'Překlad do jazyka {language}…',
    'settings.machine.failed': 'Jazyk {language} se v tomto zařízení nepodařilo nastavit.',
    'settings.machine.disclosure':
      'Strojově přeloženo v tomto zařízení. Některé formulace nemusí být přesné; vše, co ještě není přeloženo, se zobrazuje anglicky.',
    'autoFlip.language-held.title': 'Zvolený jazyk je pozastaven',
    'autoFlip.language-held.body':
      'Zvolený jazyk se překládá v tomto zařízení, což tu teď není možné, a proto se aplikace zobrazuje ve svém obvyklém jazyce. Vaše volba zůstává zachována, nebyla smazána. Jiný jazyk můžete zvolit v nabídce {route}.',
  },
  sk: {
    'settings.machine.section': 'Automatický preklad',
    'settings.machine.sectionHint':
      'Vyššie uvedené jazyky sú súčasťou aplikácie AstroLina. Nižšie uvedené jazyky sa budú automaticky prekladať v tomto zariadení.',
    'settings.machine.hint':
      'Prekladané z angličtiny v tomto zariadení, priebežne pri používaní aplikácie. Niektoré formulácie nemusia byť presné.',
    'settings.machine.downloadHint':
      'Prekladané z angličtiny v tomto zariadení. Pri prvom použití sa do zariadenia stiahne model na preklad.',
    'settings.machine.partialHint':
      'Časť aplikácie je stále v angličtine. Vyberte tento jazyk znova a dokončite stiahnutie prekladu do tohto zariadenia.',
    'settings.machine.heldDownloadHint':
      'Vaša voľba, pozastavená, kým sa preklad znova nestiahne do tohto zariadenia. Vyberte tento jazyk a spustite sťahovanie.',
    'settings.machine.heldHint':
      'Toto zariadenie momentálne nedokáže prekladať do tohto jazyka. Vaša voľba zostáva zachovaná a vráti sa, keď to bude možné.',
    'settings.machine.cacheHint':
      'Zobrazené z toho, čo toto zariadenie preložilo predtým. Tu už prekladať nemôže, takže nový text zostáva v angličtine.',
    'settings.machine.downloading': 'Sťahovanie jazyka {language} do tohto zariadenia… {percent}\u00a0%',
    'settings.machine.translating': 'Preklad do jazyka {language}…',
    'settings.machine.failed': 'Jazyk {language} sa v tomto zariadení nepodarilo nastaviť.',
    'settings.machine.disclosure':
      'Strojovo preložené v tomto zariadení. Niektoré formulácie nemusia byť presné; všetko, čo ešte nie je preložené, sa zobrazuje v angličtine.',
    'autoFlip.language-held.title': 'Zvolený jazyk je pozastavený',
    'autoFlip.language-held.body':
      'Zvolený jazyk sa prekladá v tomto zariadení, čo tu momentálne nie je možné, a preto sa aplikácia zobrazuje vo svojom obvyklom jazyku. Vaša voľba zostáva zachovaná, nebola vymazaná. Iný jazyk môžete zvoliť v ponuke {route}.',
  },
  hu: {
    'settings.machine.section': 'Automatikus fordítás',
    'settings.machine.sectionHint':
      'A fenti nyelveket az AstroLina tartalmazza. Az alábbi nyelvekre a fordítás automatikusan, ezen az eszközön történik.',
    'settings.machine.hint':
      'Angolról fordítva ezen az eszközön, az alkalmazás használata közben. Egyes megfogalmazások pontatlanok lehetnek.',
    'settings.machine.downloadHint':
      'Angolról fordítva ezen az eszközön. Első alkalommal a fordítási modell letöltődik az eszközre.',
    'settings.machine.partialHint':
      'Az alkalmazás egy része még angol nyelvű. Válaszd ki újra ezt a nyelvet, és befejeződik a fordítás letöltése erre az eszközre.',
    'settings.machine.heldDownloadHint':
      'A választásod szünetel, amíg a fordítás újra le nem töltődik erre az eszközre. Válaszd ki ezt a nyelvet a letöltés elindításához.',
    'settings.machine.heldHint':
      'Ez az eszköz jelenleg nem tud erre a nyelvre fordítani. A választásod megmarad, és visszatér, amint ez lehetséges lesz.',
    'settings.machine.cacheHint':
      'Az eszköz korábbi fordításaiból megjelenítve. Itt már nem tud fordítani, ezért az új szöveg angolul marad.',
    'settings.machine.downloading': '{language} nyelv letöltése erre az eszközre… {percent}%',
    'settings.machine.translating': 'Fordítás {language} nyelvre…',
    'settings.machine.failed': 'Nem sikerült beállítani ezen az eszközön: {language}.',
    'settings.machine.disclosure':
      'Ezen az eszközön gépi fordítással készült. Egyes megfogalmazások pontatlanok lehetnek; ami még nincs lefordítva, az angolul jelenik meg.',
    'autoFlip.language-held.title': 'A választott nyelv szünetel',
    'autoFlip.language-held.body':
      'A választott nyelvre a fordítás ezen az eszközön történik, ami itt most nem lehetséges, ezért az alkalmazás a szokásos nyelvén jelenik meg. A választásod megmarad, nem törlődik. Másik nyelvet itt választhatsz: {route}.',
  },
  ro: {
    'settings.machine.section': 'Traducere automată',
    'settings.machine.sectionHint':
      'Limbile de mai sus sunt incluse în AstroLina. Limbile de mai jos vor fi traduse automat pe acest dispozitiv.',
    'settings.machine.hint':
      'Traducere din engleză pe acest dispozitiv, pe măsură ce folosiți aplicația. Unele formulări pot fi imprecise.',
    'settings.machine.downloadHint':
      'Traducere din engleză pe acest dispozitiv. Prima dată, modelul de traducere se descarcă pe dispozitiv.',
    'settings.machine.partialHint':
      'O parte din aplicație este încă în engleză. Alegeți din nou această limbă pentru a finaliza descărcarea traducerii pe acest dispozitiv.',
    'settings.machine.heldDownloadHint':
      'Alegerea dvs., în așteptare până când traducerea este descărcată din nou pe acest dispozitiv. Alegeți această limbă pentru a porni descărcarea.',
    'settings.machine.heldHint':
      'Momentan, acest dispozitiv nu poate traduce în această limbă. Alegerea dvs. se păstrează și revine când va fi posibil.',
    'settings.machine.cacheHint':
      'Se afișează ce a tradus anterior acest dispozitiv. Aici nu mai poate traduce, așa că textul nou rămâne în engleză.',
    'settings.machine.downloading': 'Se descarcă limba {language} pe acest dispozitiv… {percent}\u00a0%',
    'settings.machine.translating': 'Se traduce în limba {language}…',
    'settings.machine.failed': 'Limba {language} nu a putut fi configurată pe acest dispozitiv.',
    'settings.machine.disclosure':
      'Traducere automată pe acest dispozitiv. Unele formulări pot fi imprecise; tot ce nu este încă tradus apare în engleză.',
    'autoFlip.language-held.title': 'Limba aleasă este în așteptare',
    'autoFlip.language-held.body':
      'Limba pe care ați ales-o se traduce pe acest dispozitiv, lucru care nu este posibil aici momentan, așa că aplicația este afișată în limba sa obișnuită. Alegerea dvs. se păstrează, nu se șterge. Pentru a alege altă limbă, accesați {route}.',
  },
  bg: {
    'settings.machine.section': 'Автоматичен превод',
    'settings.machine.sectionHint':
      'Езиците по-горе са включени в AstroLina. Езиците по-долу ще се превеждат автоматично на това устройство.',
    'settings.machine.hint':
      'Превежда се от английски на това устройство, докато използвате приложението. Някои формулировки може да не са точни.',
    'settings.machine.downloadHint':
      'Превежда се от английски на това устройство. Първия път моделът за превод се изтегля на устройството.',
    'settings.machine.partialHint':
      'Част от приложението все още е на английски. Изберете този език отново, за да завършите изтеглянето на превода на това устройство.',
    'settings.machine.heldDownloadHint':
      'Вашият избор, задържан, докато преводът не бъде изтеглен отново на това устройство. Изберете този език, за да започне изтеглянето.',
    'settings.machine.heldHint':
      'В момента това устройство не може да превежда на този език. Вашият избор се запазва и ще се върне, когато това стане възможно.',
    'settings.machine.cacheHint':
      'Показва се от превода, направен по-рано на това устройство. Тук то вече не може да превежда, затова новият текст остава на английски.',
    'settings.machine.downloading': 'Изтегляне на езика {language} на това устройство… {percent}%',
    'settings.machine.translating': 'Превеждане на {language}…',
    'settings.machine.failed': 'Езикът {language} не можа да бъде настроен на това устройство.',
    'settings.machine.disclosure':
      'Машинен превод на това устройство. Някои формулировки може да не са точни; всичко, което още не е преведено, се показва на английски.',
    'autoFlip.language-held.title': 'Избраният език е задържан',
    'autoFlip.language-held.body':
      'Избраният от вас език се превежда на това устройство, което тук в момента не е възможно, затова приложението се показва на обичайния си език. Вашият избор се запазва, не се изтрива. За да изберете друг език, отворете {route}.',
  },
  uk: {
    'settings.machine.section': 'Автоматичний переклад',
    'settings.machine.sectionHint':
      'Мови вище постачаються разом із застосунком AstroLina. Мови нижче перекладатимуться автоматично на цьому пристрої.',
    'settings.machine.hint':
      'Перекладається з англійської на цьому пристрої, поки ви користуєтеся застосунком. Деякі формулювання можуть бути неточними.',
    'settings.machine.downloadHint':
      'Перекладається з англійської на цьому пристрої. Першого разу на пристрій завантажується модель перекладу.',
    'settings.machine.partialHint':
      'Частина застосунку досі англійською. Виберіть цю мову ще раз, щоб завершити завантаження перекладу на цей пристрій.',
    'settings.machine.heldDownloadHint':
      'Ваш вибір, призупинений, доки переклад знову не буде завантажено на цей пристрій. Виберіть цю мову, щоб почати завантаження.',
    'settings.machine.heldHint':
      'Цей пристрій зараз не може перекладати на цю мову. Ваш вибір збережено, і він повернеться, щойно це стане можливим.',
    'settings.machine.cacheHint':
      'Показано з того, що цей пристрій переклав раніше. Тут він більше не може перекладати, тож новий текст залишається англійською.',
    'settings.machine.downloading': 'Завантаження мови {language} на цей пристрій… {percent}%',
    'settings.machine.translating': 'Переклад мовою {language}…',
    'settings.machine.failed': 'Не вдалося налаштувати мову {language} на цьому пристрої.',
    'settings.machine.disclosure':
      'Машинний переклад на цьому пристрої. Деякі формулювання можуть бути неточними; усе, що ще не перекладено, показано англійською.',
    'autoFlip.language-held.title': 'Вибрану мову призупинено',
    'autoFlip.language-held.body':
      'Вибрана вами мова перекладається на цьому пристрої, а тут це зараз неможливо, тому застосунок відображається звичною для нього мовою. Ваш вибір збережено, а не видалено. Щоб вибрати іншу мову, відкрийте {route}.',
  },
  el: {
    'settings.machine.section': 'Αυτόματη μετάφραση',
    'settings.machine.sectionHint':
      'Οι παραπάνω γλώσσες περιλαμβάνονται στην εφαρμογή AstroLina. Οι παρακάτω γλώσσες θα μεταφράζονται αυτόματα σε αυτή τη συσκευή.',
    'settings.machine.hint':
      'Μεταφράζεται από τα αγγλικά σε αυτή τη συσκευή, καθώς χρησιμοποιείτε την εφαρμογή. Ορισμένες διατυπώσεις μπορεί να μην είναι ακριβείς.',
    'settings.machine.downloadHint':
      'Μεταφράζεται από τα αγγλικά σε αυτή τη συσκευή. Την πρώτη φορά, γίνεται λήψη του μοντέλου μετάφρασης στη συσκευή.',
    'settings.machine.partialHint':
      'Ένα μέρος της εφαρμογής είναι ακόμη στα αγγλικά. Επιλέξτε ξανά αυτή τη γλώσσα για να ολοκληρωθεί η λήψη της μετάφρασης σε αυτή τη συσκευή.',
    'settings.machine.heldDownloadHint':
      'Η επιλογή σας, σε αναμονή μέχρι να γίνει ξανά λήψη της μετάφρασης σε αυτή τη συσκευή. Επιλέξτε αυτή τη γλώσσα για να ξεκινήσει η λήψη.',
    'settings.machine.heldHint':
      'Η συσκευή αυτή δεν μπορεί προς το παρόν να μεταφράσει σε αυτή τη γλώσσα. Η επιλογή σας διατηρείται και θα επανέλθει όταν γίνει δυνατό.',
    'settings.machine.cacheHint':
      'Εμφανίζεται από όσα είχε μεταφράσει νωρίτερα αυτή η συσκευή. Εδώ δεν μπορεί πλέον να μεταφράσει, οπότε το νέο κείμενο μένει στα αγγλικά.',
    'settings.machine.downloading': 'Λήψη της γλώσσας {language} σε αυτή τη συσκευή… {percent}%',
    'settings.machine.translating': 'Μετάφραση στη γλώσσα {language}…',
    'settings.machine.failed': 'Δεν ήταν δυνατή η ρύθμιση της γλώσσας {language} σε αυτή τη συσκευή.',
    'settings.machine.disclosure':
      'Μηχανική μετάφραση σε αυτή τη συσκευή. Ορισμένες διατυπώσεις μπορεί να μην είναι ακριβείς· ό,τι δεν έχει μεταφραστεί ακόμη εμφανίζεται στα αγγλικά.',
    'autoFlip.language-held.title': 'Η γλώσσα που επιλέξατε είναι σε αναμονή',
    'autoFlip.language-held.body':
      'Η γλώσσα που επιλέξατε μεταφράζεται σε αυτή τη συσκευή, κάτι που δεν είναι δυνατό εδώ αυτή τη στιγμή, γι’ αυτό η εφαρμογή εμφανίζεται στη συνηθισμένη της γλώσσα. Η επιλογή σας διατηρείται, δεν διαγράφεται. Για να επιλέξετε άλλη γλώσσα, ανοίξτε το μενού {route}.',
  },
  hr: {
    'settings.machine.section': 'Automatski prijevod',
    'settings.machine.sectionHint':
      'Gore navedeni jezici dio su aplikacije AstroLina. Dolje navedeni jezici prevodit će se automatski na ovom uređaju.',
    'settings.machine.hint':
      'Prevedeno s engleskog na ovom uređaju, dok koristite aplikaciju. Neke formulacije možda nisu točne.',
    'settings.machine.downloadHint':
      'Prevedeno s engleskog na ovom uređaju. Prvi put se model za prevođenje preuzima na uređaj.',
    'settings.machine.partialHint':
      'Dio aplikacije još je na engleskom. Ponovno odaberite ovaj jezik kako biste dovršili preuzimanje prijevoda na ovaj uređaj.',
    'settings.machine.heldDownloadHint':
      'Vaš odabir, na čekanju dok se prijevod ponovno ne preuzme na ovaj uređaj. Odaberite ovaj jezik kako biste pokrenuli preuzimanje.',
    'settings.machine.heldHint':
      'Ovaj uređaj trenutačno ne može prevoditi na ovaj jezik. Vaš odabir ostaje sačuvan i vratit će se kada to bude moguće.',
    'settings.machine.cacheHint':
      'Prikazano prema onome što je ovaj uređaj ranije preveo. Ovdje više ne može prevoditi, pa novi tekst ostaje na engleskom.',
    'settings.machine.downloading': 'Preuzimanje jezika {language} na ovaj uređaj… {percent}\u00a0%',
    'settings.machine.translating': 'Prevođenje na jezik {language}…',
    'settings.machine.failed': 'Jezik {language} nije bilo moguće postaviti na ovom uređaju.',
    'settings.machine.disclosure':
      'Strojno prevedeno na ovom uređaju. Neke formulacije možda nisu točne; sve što još nije prevedeno prikazuje se na engleskom.',
    'autoFlip.language-held.title': 'Odabrani jezik je na čekanju',
    'autoFlip.language-held.body':
      'Odabrani jezik prevodi se na ovom uređaju, što ovdje trenutačno nije moguće, pa se aplikacija prikazuje na svojem uobičajenom jeziku. Vaš odabir ostaje sačuvan, nije izbrisan. Drugi jezik možete odabrati u izborniku {route}.',
  },
  da: {
    'settings.machine.section': 'Automatisk oversættelse',
    'settings.machine.sectionHint':
      'Sprogene ovenfor følger med AstroLina. Sprogene nedenfor bliver oversat automatisk på denne enhed.',
    'settings.machine.hint':
      'Oversat fra engelsk på denne enhed, mens du bruger appen. Nogle formuleringer kan være upræcise.',
    'settings.machine.downloadHint':
      'Oversat fra engelsk på denne enhed. Første gang downloades oversættelsesmodellen til enheden.',
    'settings.machine.partialHint':
      'En del af appen er stadig på engelsk. Vælg sproget igen for at gøre downloadet af oversættelsen til denne enhed færdigt.',
    'settings.machine.heldDownloadHint':
      'Dit valg, sat på pause, indtil oversættelsen er downloadet til denne enhed igen. Vælg sproget for at starte downloadet.',
    'settings.machine.heldHint':
      'Denne enhed kan ikke oversætte til dette sprog lige nu. Dit valg bevares og vender tilbage, når det er muligt.',
    'settings.machine.cacheHint':
      'Vist ud fra det, denne enhed har oversat tidligere. Den kan ikke længere oversætte her, så ny tekst forbliver på engelsk.',
    'settings.machine.downloading': 'Downloader {language} til denne enhed… {percent}\u00a0%',
    'settings.machine.translating': 'Oversætter til {language}…',
    'settings.machine.failed': '{language} kunne ikke sættes op på denne enhed.',
    'settings.machine.disclosure':
      'Maskinoversat på denne enhed. Nogle formuleringer kan være upræcise; alt, der endnu ikke er oversat, vises på engelsk.',
    'autoFlip.language-held.title': 'Dit valgte sprog er sat på pause',
    'autoFlip.language-held.body':
      'Det sprog, du har valgt, oversættes på denne enhed, og det er ikke muligt her lige nu, så appen vises på sit sædvanlige sprog. Dit valg er bevaret, ikke slettet. Gå til {route} for at vælge et andet sprog.',
  },
  sv: {
    'settings.machine.section': 'Automatisk översättning',
    'settings.machine.sectionHint':
      'Språken ovan följer med AstroLina. Språken nedan översätts automatiskt på den här enheten.',
    'settings.machine.hint':
      'Översatt från engelska på den här enheten medan du använder appen. Vissa formuleringar kan vara inexakta.',
    'settings.machine.downloadHint':
      'Översatt från engelska på den här enheten. Första gången laddas översättningsmodellen ned till enheten.',
    'settings.machine.partialHint':
      'En del av appen är fortfarande på engelska. Välj språket igen för att slutföra nedladdningen av översättningen till den här enheten.',
    'settings.machine.heldDownloadHint':
      'Ditt val, pausat tills översättningen har laddats ned till den här enheten igen. Välj språket för att starta nedladdningen.',
    'settings.machine.heldHint':
      'Den här enheten kan inte översätta till det här språket just nu. Ditt val sparas och kommer tillbaka när det går.',
    'settings.machine.cacheHint':
      'Visas utifrån det som den här enheten har översatt tidigare. Den kan inte längre översätta här, så ny text förblir på engelska.',
    'settings.machine.downloading': 'Laddar ned {language} till den här enheten… {percent}\u00a0%',
    'settings.machine.translating': 'Översätter till {language}…',
    'settings.machine.failed': '{language} kunde inte konfigureras på den här enheten.',
    'settings.machine.disclosure':
      'Maskinöversatt på den här enheten. Vissa formuleringar kan vara inexakta; allt som ännu inte har översatts visas på engelska.',
    'autoFlip.language-held.title': 'Ditt valda språk är pausat',
    'autoFlip.language-held.body':
      'Språket du valde översätts på den här enheten, vilket inte går här just nu, så appen visas på sitt vanliga språk. Ditt val finns kvar och har inte rensats. Gå till {route} om du vill välja ett annat språk.',
  },
  no: {
    'settings.machine.section': 'Automatisk oversettelse',
    'settings.machine.sectionHint':
      'Språkene ovenfor følger med AstroLina. Språkene nedenfor blir oversatt automatisk på denne enheten.',
    'settings.machine.hint':
      'Oversatt fra engelsk på denne enheten mens du bruker appen. Noen formuleringer kan være unøyaktige.',
    'settings.machine.downloadHint':
      'Oversatt fra engelsk på denne enheten. Første gang lastes oversettelsesmodellen ned til enheten.',
    'settings.machine.partialHint':
      'En del av appen er fortsatt på engelsk. Velg språket igjen for å fullføre nedlastingen av oversettelsen til denne enheten.',
    'settings.machine.heldDownloadHint':
      'Valget ditt, satt på vent til oversettelsen er lastet ned til denne enheten igjen. Velg språket for å starte nedlastingen.',
    'settings.machine.heldHint':
      'Denne enheten kan ikke oversette til dette språket akkurat nå. Valget ditt beholdes og kommer tilbake når det er mulig.',
    'settings.machine.cacheHint':
      'Vises ut fra det denne enheten har oversatt tidligere. Den kan ikke lenger oversette her, så ny tekst forblir på engelsk.',
    'settings.machine.downloading': 'Laster ned {language} til denne enheten… {percent}\u00a0%',
    'settings.machine.translating': 'Oversetter til {language}…',
    'settings.machine.failed': '{language} kunne ikke settes opp på denne enheten.',
    'settings.machine.disclosure':
      'Maskinoversatt på denne enheten. Noen formuleringer kan være unøyaktige; alt som ikke er oversatt ennå, vises på engelsk.',
    'autoFlip.language-held.title': 'Det valgte språket ditt er satt på vent',
    'autoFlip.language-held.body':
      'Språket du valgte, oversettes på denne enheten, noe som ikke er mulig her akkurat nå, så appen vises på sitt vanlige språk. Valget ditt er beholdt, ikke slettet. Gå til {route} for å velge et annet språk.',
  },
  fi: {
    'settings.machine.section': 'Automaattinen käännös',
    'settings.machine.sectionHint':
      'AstroLina sisältää yllä olevat kielet. Alla olevat kielet käännetään automaattisesti tällä laitteella.',
    'settings.machine.hint':
      'Käännetty englannista tällä laitteella sitä mukaa kuin käytät sovellusta. Jotkin sanamuodot voivat olla epätarkkoja.',
    'settings.machine.downloadHint':
      'Käännetty englannista tällä laitteella. Ensimmäisellä kerralla käännösmalli ladataan laitteelle.',
    'settings.machine.partialHint':
      'Osa sovelluksesta on vielä englanniksi. Valitse tämä kieli uudelleen, niin käännöksen lataus tälle laitteelle viedään loppuun.',
    'settings.machine.heldDownloadHint':
      'Valintasi odottaa, kunnes käännös on ladattu tälle laitteelle uudelleen. Aloita lataus valitsemalla tämä kieli.',
    'settings.machine.heldHint':
      'Tämä laite ei voi juuri nyt kääntää tälle kielelle. Valintasi säilyy ja palaa, kun kääntäminen onnistuu.',
    'settings.machine.cacheHint':
      'Näytetään sen perusteella, mitä tämä laite on kääntänyt aiemmin. Laite ei voi enää kääntää täällä, joten uusi teksti jää englanniksi.',
    'settings.machine.downloading': 'Ladataan kieltä {language} tälle laitteelle… {percent}\u00a0%',
    'settings.machine.translating': 'Käännetään kielelle {language}…',
    'settings.machine.failed': 'Kieltä {language} ei voitu ottaa käyttöön tällä laitteella.',
    'settings.machine.disclosure':
      'Konekäännetty tällä laitteella. Jotkin sanamuodot voivat olla epätarkkoja; kaikki, mitä ei ole vielä käännetty, näkyy englanniksi.',
    'autoFlip.language-held.title': 'Valitsemasi kieli on odotustilassa',
    'autoFlip.language-held.body':
      'Valitsemasi kieli käännetään tällä laitteella, mikä ei ole täällä nyt mahdollista, joten sovellus näytetään tavallisella kielellään. Valintasi säilyy, sitä ei ole poistettu. Voit valita toisen kielen kohdasta {route}.',
  },
  ja: {
    'settings.machine.section': '自動翻訳',
    'settings.machine.sectionHint': '上の言語はAstroLinaに含まれています。下の言語は、このデバイス上で自動的に翻訳されます。',
    'settings.machine.hint':
      'アプリの使用に合わせて、このデバイス上で英語から順次翻訳されます。一部の表現が不正確な場合があります。',
    'settings.machine.downloadHint':
      'このデバイス上で英語から翻訳されます。初回は、翻訳モデルがこのデバイスにダウンロードされます。',
    'settings.machine.partialHint':
      'アプリの一部はまだ英語です。この言語をもう一度選択すると、このデバイスへの翻訳のダウンロードを完了できます。',
    'settings.machine.heldDownloadHint':
      '選択した言語は、翻訳がこのデバイスに再びダウンロードされるまで保留中です。この言語を選択するとダウンロードが始まります。',
    'settings.machine.heldHint':
      'このデバイスは現在、この言語に翻訳できません。選択は保持され、翻訳できるようになると元に戻ります。',
    'settings.machine.cacheHint':
      'このデバイスが以前に翻訳した内容で表示しています。ここではもう翻訳できないため、新しいテキストは英語のままです。',
    'settings.machine.downloading': '{language}をこのデバイスにダウンロード中… {percent}%',
    'settings.machine.translating': '{language}に翻訳中…',
    'settings.machine.failed': 'このデバイスで{language}を設定できませんでした。',
    'settings.machine.disclosure':
      'このデバイス上で機械翻訳されています。一部の表現が不正確な場合があります。まだ翻訳されていない部分は英語で表示されます。',
    'autoFlip.language-held.title': '選択した言語は保留中です',
    'autoFlip.language-held.body':
      '選択した言語はこのデバイス上で翻訳されますが、現在ここでは翻訳できないため、アプリは通常の言語で表示されています。選択は消去されず、保持されています。別の言語を選ぶには、「{route}」を開いてください。',
  },
  ko: {
    'settings.machine.section': '자동 번역',
    'settings.machine.sectionHint': '위의 언어는 AstroLina에 포함되어 있습니다. 아래의 언어는 이 기기에서 자동으로 번역됩니다.',
    'settings.machine.hint':
      '앱을 사용하는 동안 이 기기에서 영어를 번역합니다. 일부 표현이 정확하지 않을 수 있습니다.',
    'settings.machine.downloadHint':
      '이 기기에서 영어를 번역합니다. 처음에는 번역 모델이 이 기기에 다운로드됩니다.',
    'settings.machine.partialHint':
      '앱의 일부가 아직 영어로 표시됩니다. 이 언어를 다시 선택하면 이 기기에 번역 다운로드가 완료됩니다.',
    'settings.machine.heldDownloadHint':
      '선택한 언어이며, 번역이 이 기기에 다시 다운로드될 때까지 보류됩니다. 이 언어를 선택하면 다운로드가 시작됩니다.',
    'settings.machine.heldHint':
      '현재 이 기기에서 이 언어로 번역할 수 없습니다. 선택은 유지되며, 번역이 가능해지면 다시 적용됩니다.',
    'settings.machine.cacheHint':
      '이 기기에서 이전에 번역한 내용으로 표시됩니다. 여기서는 더 이상 번역할 수 없으므로 새 텍스트는 영어로 표시됩니다.',
    'settings.machine.downloading': '이 기기에 {language} 언어를 다운로드하는 중… {percent}%',
    'settings.machine.translating': '{language} 언어로 번역하는 중…',
    'settings.machine.failed': '이 기기에서 {language} 언어를 설정하지 못했습니다.',
    'settings.machine.disclosure':
      '이 기기에서 기계 번역되었습니다. 일부 표현이 정확하지 않을 수 있으며, 아직 번역되지 않은 부분은 영어로 표시됩니다.',
    'autoFlip.language-held.title': '선택한 언어가 보류되었습니다',
    'autoFlip.language-held.body':
      '선택한 언어는 이 기기에서 번역되는데, 지금 여기서는 번역할 수 없어 앱이 평소 언어로 표시됩니다. 선택은 삭제되지 않고 유지됩니다. 다른 언어는 {route}에서 선택할 수 있습니다.',
  },
  zh: {
    'settings.machine.section': '自动翻译',
    'settings.machine.sectionHint': '以上语言随AstroLina提供。以下语言将在此设备上自动翻译。',
    'settings.machine.hint': '在此设备上从英语翻译，随您使用应用逐步进行。部分措辞可能不准确。',
    'settings.machine.downloadHint': '在此设备上从英语翻译。首次使用时，翻译模型会下载到此设备。',
    'settings.machine.partialHint': '应用的部分内容仍为英语。再次选择此语言，即可在此设备上完成翻译下载。',
    'settings.machine.heldDownloadHint': '您选择的语言，在翻译重新下载到此设备之前暂停使用。选择此语言即可开始下载。',
    'settings.machine.heldHint': '此设备目前无法翻译成此语言。您的选择会保留，并在可以翻译时恢复。',
    'settings.machine.cacheHint': '根据此设备之前的翻译显示。此处已无法再翻译，因此新文本仍以英语显示。',
    'settings.machine.downloading': '正在将{language}下载到此设备… {percent}%',
    'settings.machine.translating': '正在翻译成{language}…',
    'settings.machine.failed': '无法在此设备上设置{language}。',
    'settings.machine.disclosure': '已在此设备上机器翻译。部分措辞可能不准确；尚未翻译的内容将以英语显示。',
    'autoFlip.language-held.title': '您选择的语言已暂停',
    'autoFlip.language-held.body':
      '您选择的语言需要在此设备上翻译，但目前此处无法翻译，因此应用以通常使用的语言显示。您的选择已保留，不会被清除。如需选择其他语言，请前往{route}。',
  },
  'zh-Hant': {
    'settings.machine.section': '自動翻譯',
    'settings.machine.sectionHint': '以上語言隨AstroLina提供。以下語言將在此裝置上自動翻譯。',
    'settings.machine.hint': '在此裝置上從英文翻譯，隨您使用應用程式逐步進行。部分措辭可能不準確。',
    'settings.machine.downloadHint': '在此裝置上從英文翻譯。第一次使用時，翻譯模型會下載到此裝置。',
    'settings.machine.partialHint': '應用程式的部分內容仍為英文。再次選擇此語言，即可在此裝置上完成翻譯下載。',
    'settings.machine.heldDownloadHint': '您選擇的語言，在翻譯重新下載到此裝置之前暫停使用。選擇此語言即可開始下載。',
    'settings.machine.heldHint': '此裝置目前無法翻譯成此語言。您的選擇會保留，並在可以翻譯時恢復。',
    'settings.machine.cacheHint': '依據此裝置先前的翻譯顯示。此處已無法再翻譯，因此新文字仍以英文顯示。',
    'settings.machine.downloading': '正在將{language}下載到此裝置… {percent}%',
    'settings.machine.translating': '正在翻譯成{language}…',
    'settings.machine.failed': '無法在此裝置上設定{language}。',
    'settings.machine.disclosure': '已在此裝置上機器翻譯。部分措辭可能不準確；尚未翻譯的內容會以英文顯示。',
    'autoFlip.language-held.title': '您選擇的語言已暫停',
    'autoFlip.language-held.body':
      '您選擇的語言需要在此裝置上翻譯，但目前此處無法翻譯，因此應用程式以平常使用的語言顯示。您的選擇已保留，不會清除。如要選擇其他語言，請前往{route}。',
  },
  vi: {
    'settings.machine.section': 'Dịch tự động',
    'settings.machine.sectionHint':
      'Các ngôn ngữ ở trên có sẵn trong AstroLina. Các ngôn ngữ ở dưới sẽ được dịch tự động trên thiết bị này.',
    'settings.machine.hint':
      'Được dịch từ tiếng Anh trên thiết bị này trong lúc bạn dùng ứng dụng. Một số cách diễn đạt có thể chưa chính xác.',
    'settings.machine.downloadHint':
      'Được dịch từ tiếng Anh trên thiết bị này. Lần đầu tiên, mô hình dịch sẽ được tải xuống thiết bị.',
    'settings.machine.partialHint':
      'Một phần ứng dụng vẫn đang hiển thị bằng tiếng Anh. Hãy chọn lại ngôn ngữ này để hoàn tất việc tải bản dịch xuống thiết bị này.',
    'settings.machine.heldDownloadHint':
      'Lựa chọn của bạn, đang tạm hoãn cho đến khi bản dịch được tải lại xuống thiết bị này. Chọn ngôn ngữ này để bắt đầu tải xuống.',
    'settings.machine.heldHint':
      'Thiết bị này hiện không thể dịch sang ngôn ngữ này. Lựa chọn của bạn vẫn được giữ và sẽ trở lại khi có thể dịch.',
    'settings.machine.cacheHint':
      'Hiển thị từ những gì thiết bị này đã dịch trước đó. Thiết bị không thể dịch ở đây nữa, nên văn bản mới vẫn bằng tiếng Anh.',
    'settings.machine.downloading': 'Đang tải {language} xuống thiết bị này… {percent}%',
    'settings.machine.translating': 'Đang dịch sang {language}…',
    'settings.machine.failed': 'Không thể thiết lập {language} trên thiết bị này.',
    'settings.machine.disclosure':
      'Được dịch máy trên thiết bị này. Một số cách diễn đạt có thể chưa chính xác; nội dung nào chưa được dịch sẽ hiển thị bằng tiếng Anh.',
    'autoFlip.language-held.title': 'Ngôn ngữ bạn chọn đang tạm hoãn',
    'autoFlip.language-held.body':
      'Ngôn ngữ bạn chọn được dịch trên thiết bị này, nhưng hiện không thể dịch ở đây, nên ứng dụng đang hiển thị bằng ngôn ngữ thông thường của nó. Lựa chọn của bạn vẫn được giữ, không bị xóa. Để chọn ngôn ngữ khác, hãy vào {route}.',
  },
  id: {
    'settings.machine.section': 'Terjemahan otomatis',
    'settings.machine.sectionHint':
      'Bahasa di atas sudah termasuk dalam AstroLina. Bahasa di bawah akan diterjemahkan secara otomatis di perangkat ini.',
    'settings.machine.hint':
      'Diterjemahkan dari bahasa Inggris di perangkat ini selagi Anda menggunakan aplikasi. Beberapa susunan kata mungkin kurang tepat.',
    'settings.machine.downloadHint':
      'Diterjemahkan dari bahasa Inggris di perangkat ini. Pada penggunaan pertama, model terjemahan diunduh ke perangkat ini.',
    'settings.machine.partialHint':
      'Sebagian aplikasi masih dalam bahasa Inggris. Pilih bahasa ini lagi untuk menyelesaikan pengunduhan terjemahan ke perangkat ini.',
    'settings.machine.heldDownloadHint':
      'Pilihan Anda, ditangguhkan hingga terjemahan diunduh kembali ke perangkat ini. Pilih bahasa ini untuk mulai mengunduh.',
    'settings.machine.heldHint':
      'Saat ini perangkat ini tidak dapat menerjemahkan ke bahasa ini. Pilihan Anda tetap disimpan dan akan kembali jika sudah memungkinkan.',
    'settings.machine.cacheHint':
      'Ditampilkan dari hasil terjemahan perangkat ini sebelumnya. Perangkat ini tidak dapat menerjemahkan di sini lagi, jadi teks baru tetap dalam bahasa Inggris.',
    'settings.machine.downloading': 'Mengunduh {language} ke perangkat ini… {percent}%',
    'settings.machine.translating': 'Menerjemahkan ke {language}…',
    'settings.machine.failed': '{language} tidak dapat disiapkan di perangkat ini.',
    'settings.machine.disclosure':
      'Diterjemahkan oleh mesin di perangkat ini. Beberapa susunan kata mungkin kurang tepat; apa pun yang belum diterjemahkan ditampilkan dalam bahasa Inggris.',
    'autoFlip.language-held.title': 'Bahasa pilihan Anda ditangguhkan',
    'autoFlip.language-held.body':
      'Bahasa yang Anda pilih diterjemahkan di perangkat ini, yang saat ini tidak dapat dilakukan di sini, sehingga aplikasi ditampilkan dalam bahasa yang biasa digunakannya. Pilihan Anda tetap disimpan, tidak dihapus. Untuk memilih bahasa lain, buka {route}.',
  },
  th: {
    'settings.machine.section': 'แปลอัตโนมัติ',
    'settings.machine.sectionHint': 'ภาษาด้านบนมาพร้อมกับ AstroLina ภาษาด้านล่างจะได้รับการแปลโดยอัตโนมัติบนอุปกรณ์นี้',
    'settings.machine.hint': 'แปลจากภาษาอังกฤษบนอุปกรณ์นี้ขณะที่คุณใช้แอป ถ้อยคำบางส่วนอาจไม่ถูกต้องนัก',
    'settings.machine.downloadHint': 'แปลจากภาษาอังกฤษบนอุปกรณ์นี้ ในครั้งแรกจะมีการดาวน์โหลดโมเดลการแปลลงในอุปกรณ์',
    'settings.machine.partialHint':
      'แอปบางส่วนยังเป็นภาษาอังกฤษ เลือกภาษานี้อีกครั้งเพื่อดาวน์โหลดคำแปลลงในอุปกรณ์นี้ให้เสร็จสิ้น',
    'settings.machine.heldDownloadHint':
      'ภาษาที่คุณเลือกไว้ถูกพักไว้จนกว่าจะดาวน์โหลดคำแปลลงในอุปกรณ์นี้อีกครั้ง เลือกภาษานี้เพื่อเริ่มดาวน์โหลด',
    'settings.machine.heldHint':
      'ขณะนี้อุปกรณ์นี้ไม่สามารถแปลเป็นภาษานี้ได้ ตัวเลือกของคุณยังคงอยู่ และจะกลับมาเมื่อแปลได้',
    'settings.machine.cacheHint':
      'แสดงจากสิ่งที่อุปกรณ์นี้เคยแปลไว้ก่อนหน้านี้ ที่นี่ไม่สามารถแปลได้อีกแล้ว ข้อความใหม่จึงยังคงเป็นภาษาอังกฤษ',
    'settings.machine.downloading': 'กำลังดาวน์โหลดภาษา {language} ลงในอุปกรณ์นี้… {percent}%',
    'settings.machine.translating': 'กำลังแปลเป็นภาษา {language}…',
    'settings.machine.failed': 'ไม่สามารถตั้งค่าภาษา {language} บนอุปกรณ์นี้ได้',
    'settings.machine.disclosure':
      'แปลด้วยเครื่องบนอุปกรณ์นี้ ถ้อยคำบางส่วนอาจไม่ถูกต้องนัก ส่วนที่ยังไม่ได้แปลจะแสดงเป็นภาษาอังกฤษ',
    'autoFlip.language-held.title': 'ภาษาที่คุณเลือกถูกพักไว้',
    'autoFlip.language-held.body':
      'ภาษาที่คุณเลือกต้องแปลบนอุปกรณ์นี้ ซึ่งไม่สามารถทำได้ที่นี่ในขณะนี้ แอปจึงแสดงในภาษาตามปกติ ตัวเลือกของคุณยังคงอยู่ ไม่ได้ถูกลบ หากต้องการเลือกภาษาอื่น ให้ไปที่ {route}',
  },
  hi: {
    'settings.machine.section': 'स्वचालित अनुवाद',
    'settings.machine.sectionHint':
      'ऊपर दी गई भाषाएँ AstroLina के साथ आती हैं। नीचे दी गई भाषाओं का अनुवाद इस डिवाइस पर स्वचालित रूप से किया जाएगा।',
    'settings.machine.hint':
      'जैसे-जैसे आप ऐप का उपयोग करते हैं, इस डिवाइस पर अंग्रेज़ी से अनुवाद होता जाता है। हो सकता है कि कुछ शब्द पूरी तरह सटीक न हों।',
    'settings.machine.downloadHint':
      'इस डिवाइस पर अंग्रेज़ी से अनुवादित। पहली बार अनुवाद मॉडल इस डिवाइस पर डाउनलोड किया जाता है।',
    'settings.machine.partialHint':
      'ऐप का कुछ हिस्सा अभी भी अंग्रेज़ी में है। इस डिवाइस पर अनुवाद का डाउनलोड पूरा करने के लिए इस भाषा को फिर से चुनें।',
    'settings.machine.heldDownloadHint':
      'आपकी चुनी हुई भाषा, जो इस डिवाइस पर अनुवाद दोबारा डाउनलोड होने तक रुकी हुई है। डाउनलोड शुरू करने के लिए इस भाषा को चुनें।',
    'settings.machine.heldHint':
      'यह डिवाइस अभी इस भाषा में अनुवाद नहीं कर सकता। आपकी पसंद सुरक्षित रहेगी, और अनुवाद संभव होते ही वापस आ जाएगी।',
    'settings.machine.cacheHint':
      'इस डिवाइस द्वारा पहले किए गए अनुवाद से दिखाया जा रहा है। यह अब यहाँ अनुवाद नहीं कर सकता, इसलिए नया टेक्स्ट अंग्रेज़ी में ही रहेगा।',
    'settings.machine.downloading': '{language} भाषा इस डिवाइस पर डाउनलोड हो रही है… {percent}%',
    'settings.machine.translating': '{language} भाषा में अनुवाद हो रहा है…',
    'settings.machine.failed': '{language} भाषा को इस डिवाइस पर सेट अप नहीं किया जा सका।',
    'settings.machine.disclosure':
      'इस डिवाइस पर मशीन से अनुवादित। हो सकता है कि कुछ शब्द पूरी तरह सटीक न हों; जिसका अनुवाद अभी नहीं हुआ है, वह अंग्रेज़ी में दिखता है।',
    'autoFlip.language-held.title': 'आपकी चुनी हुई भाषा रोकी गई है',
    'autoFlip.language-held.body':
      'आपकी चुनी हुई भाषा का अनुवाद इस डिवाइस पर होता है, जो अभी यहाँ संभव नहीं है, इसलिए ऐप अपनी सामान्य भाषा में दिखाया जा रहा है। आपकी पसंद सुरक्षित है, हटाई नहीं गई है। कोई दूसरी भाषा चुनने के लिए {route} पर जाएँ।',
  },
};
