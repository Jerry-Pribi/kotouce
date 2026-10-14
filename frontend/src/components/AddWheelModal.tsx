import { useEffect, useMemo, useRef, useState } from "react";
import type { Location } from "../types";
import { api } from "../api";

interface Props {
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
  initialDestination?: "sklad" | "v_provozu";
}

type QrResult = { rawValue: string };
type QrDetector = { detect: (source: CanvasImageSource) => Promise<QrResult[]> };
type QrDetectorConstructor = new (options: { formats: string[] }) => QrDetector;

function serialFromQr(rawValue: string) {
  const value = rawValue.trim();
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const serial = record.serial_number ?? record.serial ?? record.serialNumber;
      if (typeof serial === "string" || typeof serial === "number") return String(serial).trim();
    }
  } catch { /* QR obsahuje běžný text, ne JSON. */ }
  try {
    const url = new URL(value);
    const serial = url.searchParams.get("serial_number") ?? url.searchParams.get("serial") ?? url.searchParams.get("sn");
    if (serial) return serial.trim();
  } catch { /* Není to URL. */ }
  return value;
}

export function AddWheelModal({ locations, onClose, onCreated, initialDestination = "sklad" }: Props) {
  const [serial, setSerial] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [diameter, setDiameter] = useState(150);
  const [profile, setProfile] = useState("");
  const [takenByName, setTakenByName] = useState("");
  const [destination] = useState<"sklad" | "v_provozu">(initialDestination);
  const [locationId, setLocationId] = useState<string>("");
  const [locationSearch, setLocationSearch] = useState("");
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [maxLifetime, setMaxLifetime] = useState<string>("1000");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const availableLocations = useMemo(() => locations.filter((location) =>
    location.type === (destination === "sklad" ? "sklad" : "linka")
  ), [destination, locations]);
  const matchingLocations = useMemo(() => {
    const query = locationSearch.trim().toLocaleLowerCase("cs-CZ");
    return availableLocations
      .filter((location) => !query || location.name.toLocaleLowerCase("cs-CZ").includes(query))
      .slice(0, 30);
  }, [availableLocations, locationSearch]);

  useEffect(() => {
    if (locationId && !availableLocations.some((location) => String(location.id) === locationId)) {
      setLocationId("");
      setLocationSearch("");
    }
  }, [availableLocations, locationId]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let frameId = 0;
    setScannerMessage(null);
    const Detector = (window as Window & { BarcodeDetector?: QrDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      setScannerMessage("Tento prohlížeč nepodporuje QR čtečku. Zadejte číslo ručně nebo otevřete aplikaci v aktuálním Chrome či Edge.");
      return () => undefined;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    async function startScanner() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const scanFrame = async () => {
          if (cancelled) return;
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            frameId = window.requestAnimationFrame(() => void scanFrame());
            return;
          }
          try {
            const results = await detector.detect(video);
            if (results[0]?.rawValue) {
              setSerial(serialFromQr(results[0].rawValue));
              setScanning(false);
              return;
            }
          } catch { /* Neúplný snímek se zkusí znovu při dalším vykreslení. */ }
          if (!cancelled) frameId = window.requestAnimationFrame(() => void scanFrame());
        };
        frameId = window.requestAnimationFrame(() => void scanFrame());
      } catch {
        setScannerMessage("Kameře se nepodařilo udělit přístup. Zkontrolujte oprávnění pro kameru a zkuste to znovu.");
      }
    }
    void startScanner();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serial.trim() || !manufacturer.trim() || !profile.trim()) {
      setError("Vyplňte prosím výrobní číslo, výrobce i profil kotouče.");
      return;
    }
    if (destination === "v_provozu" && !takenByName.trim()) {
      setError("Zadejte jméno osoby, která kotouč přebírá na linku.");
      return;
    }
    if (!locationId) {
      setError(destination === "sklad" ? "Vyberte sklad, kam se má kotouč uložit." : "Vyberte výrobní linku, na kterou se má kotouč nasadit.");
      return;
    }
    setSaving(true);
    try {
      await api.createWheel({
        serial_number: serial.trim(),
        manufacturer: manufacturer.trim(),
        diameter,
        profile: profile.trim(),
        status: destination,
        location_id: locationId ? Number(locationId) : null,
        max_lifetime_m: maxLifetime ? Number(maxLifetime) : null,
        received_date: new Date().toISOString().slice(0, 10),
        note: note.trim() || null,
        taken_by_name: destination === "v_provozu" ? takenByName.trim() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se kotouč zaevidovat.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Příjem kotouče do evidence</h3>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>
              Zápis nového nástroje do závodu AGC Chudeřice
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="add-wheel-grid">
              <div className="filter-field full-width">
                <label htmlFor="serial">Výrobní číslo z vyraženého štítku *</label>
                <div className="serial-entry-row"><input
                    id="serial"
                    type="text"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    placeholder="např. 549105 nebo 13832259-2"
                    autoFocus
                    required
                  /><button type="button" className="btn btn-secondary qr-scan-button" onClick={() => setScanning((current) => !current)}>{scanning ? "Zavřít čtečku" : "▦ Načíst QR kód"}</button></div>
                <small className="serial-entry-hint">QR kód předvyplní výrobní číslo; výrobce, průměr a profil doplňte podle štítku.</small>
                {scanning && <div className="qr-scanner-panel">
                  <video ref={videoRef} className="qr-camera-preview" muted playsInline aria-label="Náhled kamery pro skenování QR kódu" />
                  <div>{scannerMessage ?? "Namiřte kameru na QR kód výrobního čísla."}</div>
                </div>}
              </div>

              <div className="filter-field">
                <label htmlFor="manufacturer">Dodavatel / Výrobce *</label>
                <input
                  id="manufacturer"
                  type="text"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="např. Tesch, Wendt, Asahi"
                  required
                />
              </div>

              <div className="filter-field">
                <label htmlFor="diameter">Průměr těla</label>
                <select
                  id="diameter"
                  value={diameter}
                  onChange={(e) => setDiameter(Number(e.target.value))}
                >
                  <option value={150}>Ø 150 mm</option>
                  <option value={250}>Ø 250 mm</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="profile">Brusný profil *</label>
                <input
                  id="profile"
                  type="text"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="např. C3,5, G1,6, U3"
                  required
                />
              </div>

              <div className="filter-field full-width">
                <label htmlFor="location-search">{destination === "sklad" ? "Vyhledejte sklad" : "Vyhledejte výrobní linku"}</label>
                <div className="location-search-wrap">
                <input
                  id="location-search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={locationSuggestionsOpen}
                  aria-controls="location-suggestions"
                  autoComplete="off"
                  value={locationSearch}
                  onFocus={() => setLocationSuggestionsOpen(true)}
                  onBlur={() => setLocationSuggestionsOpen(false)}
                  onKeyDown={(event) => { if (event.key === "Escape") setLocationSuggestionsOpen(false); }}
                  onChange={(event) => {
                    const query = event.target.value;
                    setLocationSearch(query);
                    setLocationId("");
                    setLocationSuggestionsOpen(true);
                    const exactMatch = availableLocations.filter((location) => location.name.toLocaleLowerCase("cs-CZ") === query.trim().toLocaleLowerCase("cs-CZ"));
                    if (exactMatch.length === 1) {
                      setLocationId(String(exactMatch[0].id));
                      setLocationSuggestionsOpen(false);
                    }
                  }}
                  placeholder={availableLocations.length ? `Začněte psát název ${destination === "sklad" ? "skladu" : "linky"}…` : destination === "sklad" ? "Nejprve musí administrátor založit sklad" : "Nejprve musí administrátor založit výrobní linku"}
                  required
                  disabled={!availableLocations.length}
                />
                {locationSuggestionsOpen && availableLocations.length > 0 && <div id="location-suggestions" className="location-search-suggestions" role="listbox" aria-label={destination === "sklad" ? "Dostupné sklady" : "Dostupné výrobní linky"}>
                  {matchingLocations.length > 0 ? matchingLocations.map((location) => <button
                    key={location.id}
                    type="button"
                    role="option"
                    aria-selected={String(location.id) === locationId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setLocationId(String(location.id));
                      setLocationSearch(location.name);
                      setLocationSuggestionsOpen(false);
                    }}
                  >{location.name}</button>) : <div className="location-search-empty">Žádné odpovídající stanoviště</div>}
                </div>}
                </div>
                {locationId && <small className="location-search-selected">Vybráno: {availableLocations.find((location) => String(location.id) === locationId)?.name}</small>}
                {!availableLocations.length && <small className="location-search-selected">V systému zatím není dostupné odpovídající stanoviště.</small>}
              </div>

              {destination === "v_provozu" && <div className="filter-field full-width">
                <label htmlFor="taken-by">Kdo přebírá kotouč na linku? *</label>
                <input id="taken-by" value={takenByName} onChange={(event) => setTakenByName(event.target.value)} maxLength={100} required placeholder="Jméno pracovníka" />
              </div>}

              <div className="filter-field full-width">
                <label htmlFor="lifetime">Předpokládaná max. životnost (m)</label>
                <input
                  id="lifetime"
                  type="number"
                  value={maxLifetime}
                  onChange={(e) => setMaxLifetime(e.target.value)}
                  placeholder="obvykle 1000 až 1500 m"
                />
              </div>

              <div className="filter-field full-width">
                <label htmlFor="note">Poznámka</label>
                <textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="např. určení pro přední autoskla, speciální směs..."
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border-medium)" }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--st-vyrazen-bg)", color: "var(--st-vyrazen-color)", borderRadius: 4, fontSize: "12.5px" }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Zrušit
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !locationId}>
              {saving ? "Ukládám…" : destination === "sklad" ? "Přijmout do skladu" : "Předat do provozu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
