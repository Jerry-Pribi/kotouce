# Management databáze brusných kotoučů

Digitalizovaný systém správy a sledování oběhu diamantových brusných kotoučů pro **AGC Automotive Czech a.s.** (závod Chudeřice).  
Projekt pro soutěž **TECHNOWIZZ 2026 — Téma č. 2**  
Garant v AGC: **Milan Tietze** (APU manager OEM TEM)

\---

## Kontext a cíl projektu

Společnost AGC v Chudeřicích vyrobí ročně přes 32 milionů kusů autoskel a zasklívá každé šesté auto v Evropě. Klíčovým technologickým procesem je broušení hran, kde se používají diamantové brusné kotouče pro zajištění bezpečnosti a kvality finálního skla.

### Problém stávajícího stavu (Papír vs. Excel)

* **Manuální zápis:** Operátoři zapisují údaje o průběhu využití na papírové karty u strojů (riziko ztráty, mechanického poškození a nečitelnosti dat).
* **Statický Excel:** Slouží pouze pro evidenci přítomnosti nástroje bez dynamického propojení se skutečným opotřebením.
* **Informační šum:** Neznámá okamžitá lokace kotouče, chybějící souhrnná statistika nabroušených metrů a nemožnost přesné predikce nákupu nových nástrojů.
* **Časová náročnost:** Běžný zápis a dohledání trvá cca 15 minut.

### Přínos digitálního řešení

* **Zkrácení času administrace o 80 %:** Z původních 15 minut na 3 minuty na zápis.
* **Centralizace dat:** Párování kmenových dat s provozními záznamy v jednom rozhraní dostupném i na tabletech přímo u linky.
* **Predikce nákupu a oživení:** Automatická detekce kotoučů blížících se limitu životnosti (≥ 85 % kapacity).

\---

## Digitální workflow kotouče

Aplikace pokrývá celý životní cyklus nástroje ve čtyřech fázích definovaných v zadání:

```text
\\\\\\\\\\\\\\\[ 1. Příjem ] ──> \\\\\\\\\\\\\\\[ 2. Provoz ] ──> \\\\\\\\\\\\\\\[ 3. Oživení ] ──> \\\\\\\\\\\\\\\[ 4. Vyřazení ]
```

1. **Příjem:** Zápis unikátního sériového čísla (ID od dodavatele), volba výrobce, průměru (150 / 250 mm) a profilu (např. C3,5, G1,6).
2. **Provoz:** Přiřazení na výrobní linku, průběžný zápis směn a automatický součet nabroušených metrů.
3. **Oživení (Re-profilace):** Transfer na pracoviště reprofilace, změna stavu a příprava na další cyklus.
4. **Vyřazení:** Dosažení maximální životnosti, ukončení oběhu a archivace celkového výkonu nástroje.

\---

## Datový model a sledované parametry

Struktura odpovídá specifikaci sledovaných atributů AGC:

|Atribut|Datový význam|Příklad hodnoty v systému|
|-|-|-|
|**ID kotouče**|Unikátní sériové číslo vyražené výrobcem|`549102` / `13832259-2`|
|**Výrobce / Dodavatel**|Výrobce nástroje (číselník s auto-vytvořením)|`Tesch`, `SC SuperCut`, `Asahi`, `Wendt`|
|**Typ / Profil**|Geometrický profil kotouče|`C3,5`, `G1,6`, `U3`|
|**Průměr**|Standardní průměr nástroje|`150 mm` / `250 mm`|
|**Aktuální lokace**|Fyzické umístění (linka / sklad / reprofilace)|`Linka 1`, `Sklad hala A`, `Prostor reprofilace`|
|**Stav životnosti**|Fáze životního cyklu|`Sklad`, `V provozu`, `Na reprofilaci`, `Vyřazen`|
|**Výkon (m)**|Kumulativní součet nabroušených metrů|Automatický přepočet z karet broušení|
|**Limit životnosti**|Maximální kalkulovaná kapacita v metrech|`800 m` – `1 500 m` (indikátor opotřebení)|

\---

## Technická architektura

Systém je postaven na třívrstvé architektuře s plnou kontejnerizací:

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS (responzivní rozhraní vhodné pro PC i průmyslové tablety na lince).
* **Backend:** Python 3.11, FastAPI (REST API s automatickou OpenAPI / Swagger dokumentací).
* **Databáze:** MySQL 8.0, SQLAlchemy 2.0 (ORM), migrační verzování schématu Alembic.
* **Infrastruktura:** Docker Compose, Nginx (reverzní proxy a servírování frontendu).

\---

## Spuštění systému

### Varianta 1: Jedno kliknutí (Docker Desktop)

Předpokladem je nainstalovaný a spuštěný **Docker Desktop**.

```text
Spuštění:  dvakrát kliknout na soubor  spustit.bat
Zastavení: dvakrát kliknout na soubor  zastavit.bat
```

Skript automaticky:

1. Spustí kontejnery (MySQL 8, FastAPI backend, Nginx frontend).
2. Provede databázové migrace a naplní databázi ukázkovými daty AGC (140 kotoučů, linky, sklady).
3. Otevře webový prohlížeč na adrese `http://localhost:5173`.
* **Webové rozhraní:** `http://localhost:5173`
* **Interaktivní API dokumentace (Swagger):** `http://localhost:8000/docs`

\---

### Varianta 2: Lokální běh bez Dockeru (Python + Node.js + MySQL)

Vyžaduje lokálně spuštěný MySQL server na portu 3306 (např. přes XAMPP).

#### 1\. Konfigurace databáze (`backend/.env`)

```env
DB\\\\\\\\\\\\\\\_HOST=localhost
DB\\\\\\\\\\\\\\\_PORT=3306
DB\\\\\\\\\\\\\\\_USER=root
DB\\\\\\\\\\\\\\\_PASSWORD=
DB\\\\\\\\\\\\\\\_NAME=kotouc\\\\\\\\\\\\\\\_manager
```

#### 2\. Spuštění backendu (PowerShell v `backend/`)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
python -m venv .venv
.\\\\\\\\\\\\\\\\.venv\\\\\\\\\\\\\\\\Scripts\\\\\\\\\\\\\\\\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

#### 3\. Spuštění frontendu (PowerShell v `frontend/`)

```powershell
npm install
npm run dev
```

Aplikace běží na `http://localhost:5173`.

\---

## Přehled REST API rozhraní

|Metoda|Endpoint|Účel|
|-|-|-|
|`GET`|`/api/dashboard`|Souhrnná statistika, počty dle stavu, matice výrobce × průměr × profil, predikce konce životnosti|
|`GET`|`/api/wheels`|Filtrovaný seznam kotoučů (vyhledávání dle ID, filtry: stav, výrobce, průměr, profil, lokace)|
|`POST`|`/api/wheels`|Založení nového kotouče (automatická registrace neexistujícího výrobce/profilu)|
|`GET`|`/api/wheels/{id}`|Detail kotouče, celkový výkon v metrech a historie záznamů směn|
|`PATCH`|`/api/wheels/{id}`|Změna stavu (provoz, reprofilace, vyřazení), přesun na jinou lokaci, poznámka|
|`DELETE`|`/api/wheels/{id}`|Vyřazení a smazání záznamu|
|`POST`|`/api/wheels/{id}/usage`|Zápis směny operátorem (datum, nabroušené metry, jméno operátora, poznámka)|
|`GET` / `POST`|`/api/manufacturers`|Správa číselníku výrobců|
|`GET` / `POST`|`/api/profiles`|Správa číselníku profilů|
|`GET` / `POST`|`/api/locations`|Správa výrobních linek, skladů a reprofilace|

\---

## Řešení častých provozních stavů

* **Zablokované skripty v PowerShellu:** Spustit `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
* **Chyba spojení s MySQL (WinError 10061):** Zkontrolovat, zda v XAMPP svítí zeleně služba MySQL (port 3306).
* **Blokace souborů OneDrivem:** Doporučeno spouštět z lokálního disku mimo synchronizovanou složku, aby nedocházelo k zamykání `.venv` a `node\\\\\\\\\\\\\\\_modules`.

