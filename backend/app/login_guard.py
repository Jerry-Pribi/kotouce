"""Ochrana proti hádání hesel: po 5 neúspěšných pokusech se přihlášení k účtu na 5 minut zablokuje.

Počítá se pro každý účet zvlášť (sekce + firma + jméno), i když účet neexistuje —
útočník tak z odpovědi nepozná, jestli jméno v systému je.
Úspěšné přihlášení počítadlo vynuluje. Stav je v paměti serveru (po restartu se vynuluje).
"""
import threading
import time

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 5 * 60   # chybné pokusy se počítají za posledních 5 minut
LOCK_SECONDS = 5 * 60     # po 5. chybě zámek na 5 minut

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}


def account_key(portal: str, company_id: int | None, username: str) -> str:
    return f"{portal}:{company_id or '-'}:{username.strip().lower()}"


def seconds_locked(key: str) -> int:
    """Kolik sekund ještě zbývá do odemčení (0 = není zamčeno)."""
    with _lock:
        until = _locked_until.get(key, 0.0)
        remaining = until - time.monotonic()
        if remaining <= 0:
            _locked_until.pop(key, None)
            return 0
        return int(remaining) + 1


def register_failure(key: str) -> int:
    """Zapíše chybný pokus. Vrací počet sekund zámku, když se právě zamklo, jinak 0."""
    now = time.monotonic()
    with _lock:
        recent = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
        recent.append(now)
        if len(recent) >= MAX_ATTEMPTS:
            _failures.pop(key, None)
            _locked_until[key] = now + LOCK_SECONDS
            return LOCK_SECONDS
        _failures[key] = recent
        return 0


def register_success(key: str) -> None:
    with _lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)


def lock_message(seconds: int) -> str:
    minutes = max(1, -(-seconds // 60))  # zaokrouhlit nahoru
    unit = "minutu" if minutes == 1 else "minuty" if minutes < 5 else "minut"
    return f"Příliš mnoho neúspěšných pokusů o přihlášení. Zkuste to znovu za {minutes} {unit}."
