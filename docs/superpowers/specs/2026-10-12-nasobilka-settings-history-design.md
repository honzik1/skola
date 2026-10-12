# Násobilka: obtížnost, časomíra a historie testů

## Cíl

Rozšířit existující jedno-html aplikaci pro procvičování násobilky tak, aby:

- projektové soubory byly v podadresáři `nasobilka`,
- testy s vybranými násobilkami `0`, `1` nebo `2` ignorovaly omezení snadných příkladů,
- v ostatních případech tvořily příklady s `0`, `1` nebo `2` nejvýše 5 % testu,
- aplikace měřila dobu testu a zobrazila ji ve výsledku,
- dokončené testy ukládala a zobrazovala jako historii posledních 20 testů.

## Rozsah a přesun souborů

Stávající soubory se přesunou takto:

- `index.html` → `nasobilka/index.html`
- `test/math-quiz.test.js` → `nasobilka/test/math-quiz.test.js`

Testovací harness zůstane relativní k přesunutému `index.html`, takže `node --test` spuštěný z adresáře `nasobilka` bude fungovat beze změny. Kořen repozitáře nebude obsahovat druhou kopii aplikace.

## Generování příkladů

### Výběr násobilek

Výběr na úvodní stránce bude obsahovat `0–10`. Vybraná čísla jsou prvními činiteli násobení. Druhý činitel bude v rozsahu `0–10`; tím se zachová možnost generovat nulové příklady i pro násobilky větší než nula.

### Omezení snadných příkladů

Při výběru kandidátních příkladů se každý příklad označí jako snadný, pokud:

- u násobení obsahuje v některém z činitelů hodnotu `0`, `1` nebo `2`, nebo
- u dělení obsahuje v děliteli či dělenci hodnotu `0`, `1` nebo `2`.

Dělení nulou se negeneruje; současná podmínka dělitele od `1` do `10` zůstává zachována. Nulový dělenec je platný příklad a patří mezi snadné.

Pokud je mezi vybranými násobilkami alespoň jedno z čísel `0`, `1`, `2`, omezení se nepoužije a pool se chová jako dosud rozšířený o nulu.

Jinak se pool rozdělí na snadné a ostatní příklady. Po zamíchání se vybere nejvýše:

```text
floor(požadovaný počet × 0,05)
```

snadných příkladů a zbytek z ostatních. Výsledný seznam se znovu zamíchá. Příklady se neopakují. Pokud není dost ostatních unikátních příkladů, test skončí s menším počtem otázek a použije se existující upozornění o dostupném počtu příkladů; limit 5 % se nebude obcházet doplňováním snadných příkladů.

## Časomíra

- Po úspěšné validaci nastavení a vytvoření neprázdného testu se uloží `startedAt = Date.now()`.
- Při prvním dokončení poslední otázky se uloží `completedAt = Date.now()` a `durationMs = completedAt - startedAt`.
- Výsledek zobrazí dobu jako celé minuty a sekundy, například `2 min 07 s`.
- Časomíra se během testu neukládá jako rozpracovaný stav; reload stránky rozpracovaný test ukončí a historie se zapíše až po dokončení.

## Historie v localStorage

Současné ukládání nastavení zůstane oddělené pod klíčem `mathQuizSettings`. Historie bude pod novým klíčem `mathQuizHistory`.

Jeden uložený záznam:

```json
{
  "completedAt": "2026-10-12T12:34:56.000Z",
  "description": "Násobení; násobilka 3, 5; 20 příkladů",
  "incorrectCount": 3,
  "durationMs": 127000
}
```

Při dokončení testu se nový záznam vloží na začátek, seznam se omezí na 20 položek a uloží se zpět. Do popisu se zahrnou skutečně zvolené operace, násobilky a požadovaný počet příkladů.

Načítání historie:

- proběhne při inicializaci aplikace,
- záznamy se zobrazí od nejnovějšího,
- datum se formátuje přes lokalizaci `cs-CZ`,
- doba se formátuje stejným formátem jako výsledek,
- prázdná historie zobrazí informaci, že zatím nebyl dokončen žádný test,
- neplatný JSON, neplatné záznamy nebo nedostupný `localStorage` se ignorují bez pádu aplikace.

Tabulka bude pod formulářem nastavení a bude mít sloupce:

1. Datum a čas dokončení
2. Popis testu
3. Chyby
4. Doba testu

Po dokončení nového testu se tabulka aktualizuje bez reloadu stránky.

## Výsledková obrazovka

K existujícímu skóre a počtu správných/chybných odpovědí přibude samostatná položka s celkovou dobou testu. Záznam do historie se vytvoří pouze jednou pro dokončený test, aby opakované vykreslení výsledku nevytvořilo duplicitu.

## Odolnost a kompatibilita

- Přístupy do `localStorage` budou v `try/catch` kvůli režimům, kde je úložiště zakázané.
- Starší uložená nastavení bez nových polí zůstanou použitelná; chybějící položky se ponechají na výchozích hodnotách.
- Historie se nebude zapisovat před dokončením testu.
- Stávající ovládání klávesnicí, validace odpovědí a výběr operací zůstanou zachovány.

## Testování

Doplní se testy pro:

- přítomnost násobilky `0` a druhého činitele `0–10`,
- rozdělení a limit snadných příkladů na 5 %,
- ignorování limitu při vybrané násobilce `0`, `1` nebo `2`,
- výpočet a formátování doby testu,
- uložení jednoho dokončeného výsledku a omezení historie na 20 záznamů,
- načtení a zobrazení historie,
- bezpečné ignorování poškozených dat v `localStorage`,
- přesunuté cesty testovacího harnessu.

Ověření proběhne příkazem `node --test` z adresáře `nasobilka`.
