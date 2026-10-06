"""Populate the MySQL database with realistic sample data for AGC Automotive Czech.

Run with: python -m app.seed
"""
import os
import random
from datetime import date, timedelta
from urllib.parse import quote_plus
import pymysql
from sqlalchemy import text

from .database import Base, engine, SessionLocal
from . import models, crud, schemas

random.seed(42)

def ensure_database_exists():
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = int(os.getenv("DB_PORT", "3306"))
    db_user = os.getenv("DB_USER", "root")
    db_pass = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "kotouc_manager")

    try:
        conn = pymysql.connect(host=db_host, port=db_port, user=db_user, password=db_pass)
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Poznámka ke kontrole databáze: {e}")

MANUFACTURERS = ["SC (SuperCut)", "Tesch", "DBCZ (Wendt)", "Asahi", "HPGS"]
PROFILES_150 = ["C2,1", "C3", "C3,5", "C4", "C5", "U2", "U3", "U3,5", "U4", "G1,6", "G1,7", "G1,6-2,1", "C1,6", "C1,9"]
PROFILES_250 = ["C3", "C3,5", "C4", "C5", "U2,6", "U3", "U3,5", "U4", "G1,6", "G1,7", "C1,6", "C1,9", "C2,1"]
LOCATIONS = [
    ("Linka 1 - broušení hrany", models.LocationType.LINKA),
    ("Linka 2 - broušení hrany", models.LocationType.LINKA),
    ("Linka 3 - broušení hrany", models.LocationType.LINKA),
    ("Sklad kotoučů - hala A", models.LocationType.SKLAD),
    ("Sklad kotoučů - hala B", models.LocationType.SKLAD),
    ("Prostor reprofilace", models.LocationType.REPROFILACE),
]


def run(reset: bool = True, check_db: bool = False):
    if check_db:
        ensure_database_exists()

    if reset:
        with engine.connect() as connection:
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
            for tbl in reversed(Base.metadata.sorted_tables):
                connection.execute(text(f"DROP TABLE IF EXISTS `{tbl.name}`;"))
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
            connection.commit()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    locations = {}
    for name, ltype in LOCATIONS:
        loc = models.Location(name=name, type=ltype)
        db.add(loc)
        db.flush()
        locations[name] = loc

    serial_counter = 549000
    wheels = []
    for _ in range(140):
        diameter = random.choice([150, 250])
        profiles = PROFILES_150 if diameter == 150 else PROFILES_250
        manufacturer_name = random.choice(MANUFACTURERS)
        profile_code = random.choice(profiles)

        status_roll = random.random()
        if status_roll < 0.55:
            status = models.WheelStatus.SKLAD
            location = random.choice(
                [l for l in locations.values() if l.type == models.LocationType.SKLAD]
            )
        elif status_roll < 0.80:
            status = models.WheelStatus.V_PROVOZU
            location = random.choice(
                [l for l in locations.values() if l.type == models.LocationType.LINKA]
            )
        elif status_roll < 0.93:
            status = models.WheelStatus.NA_REPROFILACI
            location = locations["Prostor reprofilace"]
        else:
            status = models.WheelStatus.VYRAZEN
            location = None

        serial_counter += 1
        received = date(2025, 1, 1) + timedelta(days=random.randint(0, 600))

        wheel = models.Wheel(
            serial_number=str(serial_counter),
            manufacturer=crud.get_or_create_manufacturer(db, manufacturer_name),
            diameter=diameter,
            profile=crud.get_or_create_profile(db, profile_code),
            status=status,
            location=location,
            max_lifetime_m=random.choice([800, 1000, 1200, 1500]),
            received_date=received,
            retired_date=received + timedelta(days=random.randint(30, 500))
            if status == models.WheelStatus.VYRAZEN
            else None,
        )
        db.add(wheel)
        db.flush()
        wheels.append(wheel)

        if status != models.WheelStatus.SKLAD:
            n_records = random.randint(2, 12)
            d = received
            for _ in range(n_records):
                d = d + timedelta(days=random.randint(1, 20))
                if d > date.today():
                    break
                db.add(
                    models.UsageRecord(
                        wheel_id=wheel.id,
                        record_date=d,
                        meters_ground=round(random.uniform(15, 90), 1),
                        operator=random.choice(["Novák", "Svobodová", "Dvořák", "König", "Procházka"]),
                    )
                )

    db.commit()
    print(f"Vytvořeno {len(wheels)} kotoučů, {len(locations)} lokací.")
    db.close()


if __name__ == "__main__":
    run(reset=True, check_db=True)
