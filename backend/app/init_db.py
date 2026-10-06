"""Spouštěcí inicializace pro Docker: seed databáze jen pokud je prázdná.

Spuštění: python -m app.init_db
"""
import sys
from sqlalchemy import text
from .database import SessionLocal


def main():
    count = 0
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT COUNT(*) FROM wheels"))
        count = result.scalar() or 0
    except Exception as e:
        print(f"Poznámka ke kontrole tabulky wheels: {e}")
        count = 0
    finally:
        db.close()

    sys.stdout.flush()

    if count == 0:
        print("Databáze je prázdná — seeduji ukázková data...")
        sys.stdout.flush()
        from .seed import run
        run(reset=False, check_db=False)
        print("Seed hotov.")
    else:
        print(f"Databáze již obsahuje {count} kotoučů — seed přeskočen.")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
